import type { PlanExtraction } from "@/lib/ai/extractionSchema";
import type { Calibration, Level, Opening, Room, Stair, Wall } from "@/lib/model/schema";
import { pixelToMm, pixelLengthToMm } from "@/lib/calibration/calibration";
import {
  COORDINATE_ROUNDING_MM,
  IMPORT_DEFAULTS,
  THICKNESS_ROUNDING_MM,
} from "@/lib/model/importDefaults";
import { distanceToSegment, snapValue, wallLengthMm } from "@/lib/geometry";

export type ImportWarning = {
  /** Stable id so the UI can group and dismiss warnings. */
  code:
    | "assumed-opening-height"
    | "assumed-wall-thickness"
    | "orphan-opening"
    | "opening-off-wall"
    | "degenerate-wall"
    | "open-room"
    | "low-confidence"
    | "assumed-storey-height"
    | "extractor-note";
  message: string;
  /** Model id of the element the warning is about, when there is one. */
  elementId?: string;
};

export type ImportResult = {
  level: Level;
  warnings: ImportWarning[];
};

function roundTo(value: number, increment: number): number {
  return Math.round(value / increment) * increment;
}

function makeId(prefix: string, ref: string, used: Set<string>): string {
  const base = `${prefix}-${ref.replace(/[^a-zA-Z0-9_-]/g, "") || "x"}`;
  let id = base;
  let n = 2;
  while (used.has(id)) {
    id = `${base}-${n++}`;
  }
  used.add(id);
  return id;
}

/**
 * Convert a pixel-space extraction into a millimetre-space Level.
 *
 * Anything the drawing could not show becomes an IMPORT_DEFAULTS value plus a
 * warning. Anything inconsistent (an opening that does not sit on its wall, a
 * zero-length wall) is dropped with a warning rather than repaired silently —
 * a wall that quietly moves is worse than one that is visibly missing.
 */
export function levelFromExtraction(params: {
  extraction: PlanExtraction;
  calibration: Calibration;
  levelIndex: number;
  levelName: string;
  floorToCeilingMm?: number;
  slabThicknessMm?: number;
}): ImportResult {
  const { extraction, calibration, levelIndex } = params;
  const warnings: ImportWarning[] = [];
  const usedIds = new Set<string>();

  const toMm = (px: { x: number; y: number }) => {
    const mm = pixelToMm(px, calibration);
    return {
      x: roundTo(mm.x, COORDINATE_ROUNDING_MM),
      y: roundTo(mm.y, COORDINATE_ROUNDING_MM),
    };
  };

  // --- walls -----------------------------------------------------------
  const walls: Wall[] = [];
  const wallIdByRef = new Map<string, string>();

  for (const ew of extraction.walls) {
    const start = toMm(ew.startPx);
    const end = toMm(ew.endPx);
    const id = makeId("w", ew.ref, usedIds);

    if (start.x === end.x && start.y === end.y) {
      warnings.push({
        code: "degenerate-wall",
        message: `Wall "${ew.ref}" has zero length after calibration and was dropped.`,
      });
      continue;
    }

    let thicknessMm = roundTo(
      pixelLengthToMm(ew.thicknessPx, calibration),
      THICKNESS_ROUNDING_MM,
    );
    if (!(thicknessMm > 0)) {
      thicknessMm =
        ew.kind === "external"
          ? IMPORT_DEFAULTS.fallbackExternalWallThicknessMm
          : IMPORT_DEFAULTS.fallbackInternalWallThicknessMm;
      warnings.push({
        code: "assumed-wall-thickness",
        elementId: id,
        message: `Wall "${ew.ref}" was drawn without a measurable thickness; assumed ${thicknessMm}mm (${ew.kind}). Measure and correct it.`,
      });
    }

    if (ew.confidence === "low") {
      warnings.push({
        code: "low-confidence",
        elementId: id,
        message: `The extractor was unsure about wall "${ew.ref}". Check it against the plan.`,
      });
    }

    wallIdByRef.set(ew.ref, id);
    walls.push({
      id,
      start,
      end,
      thicknessMm,
      kind: ew.kind,
      // Never inferred from a drawing — a human sets this, or a structural
      // engineer does. Phase 5 flags anything that stays "unknown".
      structural: "unknown",
      status: "existing",
    });
  }

  // --- openings --------------------------------------------------------
  const openings: Opening[] = [];
  for (const eo of extraction.openings) {
    const wallId = wallIdByRef.get(eo.wallRef);
    const wall = walls.find((w) => w.id === wallId);
    if (!wall) {
      warnings.push({
        code: "orphan-opening",
        message: `${eo.type} "${eo.ref}" referenced wall "${eo.wallRef}", which was not imported. The opening was dropped.`,
      });
      continue;
    }

    const centre = toMm(eo.centrePx);
    const { distance: offAxisMm, t } = distanceToSegment(
      centre,
      wall.start,
      wall.end,
    );
    // Half the wall thickness plus a 150mm reading tolerance: beyond that the
    // opening was probably matched to the wrong wall.
    const tolerance = wall.thicknessMm / 2 + 150;
    if (offAxisMm > tolerance) {
      warnings.push({
        code: "opening-off-wall",
        message: `${eo.type} "${eo.ref}" sits ${Math.round(offAxisMm)}mm off wall "${eo.wallRef}" and was dropped. Re-add it in the editor if the plan shows one.`,
      });
      continue;
    }

    const widthMm = Math.max(
      50,
      roundTo(pixelLengthToMm(eo.widthPx, calibration), THICKNESS_ROUNDING_MM),
    );
    const lengthMm = wallLengthMm(wall);
    const offsetMm = Math.min(
      Math.max(t * lengthMm - widthMm / 2, 0),
      Math.max(lengthMm - widthMm, 0),
    );

    const id = makeId("o", eo.ref, usedIds);
    const heightMm =
      eo.type === "door"
        ? IMPORT_DEFAULTS.doorHeightMm
        : eo.type === "window"
          ? IMPORT_DEFAULTS.windowHeightMm
          : IMPORT_DEFAULTS.rooflightHeightMm;
    const sillMm = eo.type === "door" ? 0 : IMPORT_DEFAULTS.windowSillMm;

    openings.push({
      id,
      wallId: wall.id,
      type: eo.type,
      offsetMm: roundTo(offsetMm, COORDINATE_ROUNDING_MM),
      widthMm,
      heightMm,
      sillMm,
      status: "existing",
    });

    warnings.push({
      code: "assumed-opening-height",
      elementId: id,
      message:
        eo.type === "door"
          ? `Door "${eo.ref}": height assumed ${heightMm}mm. A plan cannot show it.`
          : `${eo.type === "window" ? "Window" : "Rooflight"} "${eo.ref}": height assumed ${heightMm}mm and sill ${sillMm}mm. A plan cannot show either — measure them, because Part B escape-window checks depend on both.`,
    });
  }

  // --- rooms -----------------------------------------------------------
  const rooms: Room[] = [];
  for (const er of extraction.rooms) {
    const id = makeId("r", er.ref, usedIds);
    if (er.polygonPx.length < 3) {
      warnings.push({
        code: "open-room",
        message: `Room "${er.name || er.ref}" had fewer than three corners and was dropped.`,
      });
      continue;
    }
    rooms.push({
      id,
      name: er.name || `Unnamed ${er.use}`,
      use: er.use,
      polygon: er.polygonPx.map(toMm),
      status: "existing",
    });
    if (er.name === "") {
      warnings.push({
        code: "low-confidence",
        elementId: id,
        message: `A space was unlabelled on the plan and was classified as "${er.use}" from context. Name it in the editor.`,
      });
    }
  }

  // --- stairs ----------------------------------------------------------
  // Rise and going are NOT read from the plan. Treads give a going estimate;
  // rise needs the floor-to-floor height, which Phase 4's stair calculator
  // derives properly. Here we record geometry and leave the numbers flagged.
  const stairs: Stair[] = [];
  for (const es of extraction.stairs) {
    const id = makeId("s", es.ref, usedIds);
    const widthMm = roundTo(
      pixelLengthToMm(es.widthPx, calibration),
      THICKNESS_ROUNDING_MM,
    );
    const treads = es.countedTreads > 0 ? es.countedTreads : 13;
    const floorToFloor =
      (params.floorToCeilingMm ?? IMPORT_DEFAULTS.floorToCeilingMm) +
      (params.slabThicknessMm ?? IMPORT_DEFAULTS.slabThicknessMm);
    const risers = treads + 1;

    stairs.push({
      id,
      fromLevel: levelIndex,
      toLevel: levelIndex + 1,
      type: es.type,
      origin: toMm(es.originPx),
      directionDeg: es.directionDeg,
      widthMm: widthMm > 0 ? widthMm : IMPORT_DEFAULTS.fallbackStairWidthMm,
      risers,
      riseMm: Math.round(floorToFloor / risers),
      goingMm: 220,
      status: "existing",
    });

    warnings.push({
      code: "low-confidence",
      elementId: id,
      message:
        es.countedTreads > 0
          ? `Stair "${es.ref}": ${risers} risers derived from ${treads} counted treads, and rise derived from an ASSUMED floor-to-floor of ${floorToFloor}mm. Measure the real floor-to-floor height and going.`
          : `Stair "${es.ref}": treads were not countable on the plan. Riser count, rise and going are all placeholders — measure them.`,
    });
  }

  warnings.push({
    code: "assumed-storey-height",
    message: `Floor-to-ceiling (${params.floorToCeilingMm ?? IMPORT_DEFAULTS.floorToCeilingMm}mm) and slab thickness (${params.slabThicknessMm ?? IMPORT_DEFAULTS.slabThicknessMm}mm) are placeholders — a plan view cannot show them. Measure floor to ceiling and set it before trusting any stair or headroom check.`,
  });

  for (const note of extraction.notes) {
    warnings.push({ code: "extractor-note", message: note });
  }

  const level: Level = {
    index: levelIndex,
    name: params.levelName,
    floorToCeilingMm:
      params.floorToCeilingMm ?? IMPORT_DEFAULTS.floorToCeilingMm,
    slabThicknessMm: params.slabThicknessMm ?? IMPORT_DEFAULTS.slabThicknessMm,
    walls,
    openings,
    rooms,
    stairs,
  };

  return { level, warnings };
}

/**
 * Re-apply a new calibration to an already-imported level.
 *
 * Used when the printed-dimension check disagrees with the clicked points and
 * the user accepts the suggested scale. Pure ratio scaling about the model
 * origin: no re-extraction, no data loss.
 */
export function rescaleLevel(level: Level, factor: number): Level {
  const scalePoint = (p: { x: number; y: number }) => ({
    x: snapValue(p.x * factor, 1),
    y: snapValue(p.y * factor, 1),
  });
  return {
    ...level,
    walls: level.walls.map((w) => ({
      ...w,
      start: scalePoint(w.start),
      end: scalePoint(w.end),
      thicknessMm: snapValue(w.thicknessMm * factor, 1),
    })),
    openings: level.openings.map((o) => ({
      ...o,
      offsetMm: snapValue(o.offsetMm * factor, 1),
      widthMm: snapValue(o.widthMm * factor, 1),
    })),
    rooms: level.rooms.map((r) => ({
      ...r,
      polygon: r.polygon.map(scalePoint),
    })),
    stairs: level.stairs.map((s) => ({
      ...s,
      origin: scalePoint(s.origin),
      widthMm: snapValue(s.widthMm * factor, 1),
    })),
  };
}
