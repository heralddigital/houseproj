import { describe, expect, it } from "vitest";
import { levelFromExtraction, rescaleLevel } from "./fromExtraction";
import { buildCalibration } from "@/lib/calibration/calibration";
import { EMPTY_EXTRACTION, type PlanExtraction } from "@/lib/ai/extractionSchema";
import { LevelSchema } from "@/lib/model/schema";
import { IMPORT_DEFAULTS } from "@/lib/model/importDefaults";

// 1px = 10mm, origin at (0,0).
const calibration = buildCalibration({
  levelIndex: 0,
  pointA: { x: 0, y: 0 },
  pointB: { x: 100, y: 0 },
  realDistanceMm: 1000,
  originPx: { x: 0, y: 0 },
});

const baseExtraction = (over: Partial<PlanExtraction> = {}): PlanExtraction => ({
  ...EMPTY_EXTRACTION,
  walls: [
    {
      ref: "w1",
      startPx: { x: 0, y: 0 },
      endPx: { x: 500, y: 0 },
      thicknessPx: 30,
      kind: "external",
      confidence: "high",
    },
  ],
  ...over,
});

const importLevel = (extraction: PlanExtraction) =>
  levelFromExtraction({
    extraction,
    calibration,
    levelIndex: 0,
    levelName: "Ground floor",
  });

describe("levelFromExtraction", () => {
  it("produces a schema-valid level", () => {
    const { level } = importLevel(baseExtraction());
    expect(LevelSchema.safeParse(level).success).toBe(true);
  });

  it("converts pixel walls to millimetres", () => {
    const { level } = importLevel(baseExtraction());
    expect(level.walls[0].start).toEqual({ x: 0, y: 0 });
    expect(level.walls[0].end).toEqual({ x: 5000, y: 0 });
    expect(level.walls[0].thicknessMm).toBe(300);
  });

  it("never infers a structural role", () => {
    const { level } = importLevel(baseExtraction());
    expect(level.walls[0].structural).toBe("unknown");
  });

  it("falls back to a default thickness and warns when none was drawn", () => {
    const { level, warnings } = importLevel(
      baseExtraction({
        walls: [
          {
            ref: "w1",
            startPx: { x: 0, y: 0 },
            endPx: { x: 500, y: 0 },
            thicknessPx: 0,
            kind: "external",
            confidence: "high",
          },
        ],
      }),
    );
    expect(level.walls[0].thicknessMm).toBe(
      IMPORT_DEFAULTS.fallbackExternalWallThicknessMm,
    );
    expect(warnings.some((w) => w.code === "assumed-wall-thickness")).toBe(true);
  });

  it("drops a zero-length wall with a warning", () => {
    const { level, warnings } = importLevel(
      baseExtraction({
        walls: [
          {
            ref: "w1",
            startPx: { x: 10, y: 10 },
            endPx: { x: 10, y: 10 },
            thicknessPx: 30,
            kind: "internal",
            confidence: "low",
          },
        ],
      }),
    );
    expect(level.walls).toHaveLength(0);
    expect(warnings.some((w) => w.code === "degenerate-wall")).toBe(true);
  });

  it("places an opening at an offset from the wall start", () => {
    const { level } = importLevel(
      baseExtraction({
        openings: [
          {
            ref: "d1",
            wallRef: "w1",
            type: "door",
            centrePx: { x: 250, y: 0 },
            widthPx: 90,
            confidence: "high",
          },
        ],
      }),
    );
    const opening = level.openings[0];
    // centre at 2500mm, width 900mm -> near edge at 2050mm
    expect(opening.widthMm).toBe(900);
    expect(opening.offsetMm).toBe(2050);
    expect(opening.wallId).toBe(level.walls[0].id);
  });

  it("keeps an opening inside its wall when it is drawn near the end", () => {
    const { level } = importLevel(
      baseExtraction({
        openings: [
          {
            ref: "d1",
            wallRef: "w1",
            type: "door",
            centrePx: { x: 495, y: 0 },
            widthPx: 90,
            confidence: "high",
          },
        ],
      }),
    );
    const opening = level.openings[0];
    expect(opening.offsetMm + opening.widthMm).toBeLessThanOrEqual(5000);
  });

  it("drops an opening whose wall was not imported", () => {
    const { level, warnings } = importLevel(
      baseExtraction({
        openings: [
          {
            ref: "d1",
            wallRef: "nope",
            type: "door",
            centrePx: { x: 250, y: 0 },
            widthPx: 90,
            confidence: "medium",
          },
        ],
      }),
    );
    expect(level.openings).toHaveLength(0);
    expect(warnings.some((w) => w.code === "orphan-opening")).toBe(true);
  });

  it("drops an opening that does not sit on its wall", () => {
    const { level, warnings } = importLevel(
      baseExtraction({
        openings: [
          {
            ref: "d1",
            wallRef: "w1",
            type: "door",
            centrePx: { x: 250, y: 200 }, // 2000mm off the wall line
            widthPx: 90,
            confidence: "low",
          },
        ],
      }),
    );
    expect(level.openings).toHaveLength(0);
    expect(warnings.some((w) => w.code === "opening-off-wall")).toBe(true);
  });

  it("warns that every opening height is an assumption", () => {
    const { warnings } = importLevel(
      baseExtraction({
        openings: [
          {
            ref: "win1",
            wallRef: "w1",
            type: "window",
            centrePx: { x: 250, y: 0 },
            widthPx: 120,
            confidence: "high",
          },
        ],
      }),
    );
    const assumed = warnings.filter((w) => w.code === "assumed-opening-height");
    expect(assumed).toHaveLength(1);
    expect(assumed[0].message).toMatch(/sill/i);
  });

  it("converts room polygons and keeps the printed name", () => {
    const { level } = importLevel(
      baseExtraction({
        rooms: [
          {
            ref: "r1",
            name: "Kitchen/Diner",
            use: "kitchen",
            polygonPx: [
              { x: 0, y: 0 },
              { x: 400, y: 0 },
              { x: 400, y: 300 },
              { x: 0, y: 300 },
            ],
            confidence: "high",
          },
        ],
      }),
    );
    expect(level.rooms[0].name).toBe("Kitchen/Diner");
    expect(level.rooms[0].polygon[2]).toEqual({ x: 4000, y: 3000 });
  });

  it("flags an unlabelled room", () => {
    const { warnings } = importLevel(
      baseExtraction({
        rooms: [
          {
            ref: "r1",
            name: "",
            use: "other",
            polygonPx: [
              { x: 0, y: 0 },
              { x: 100, y: 0 },
              { x: 100, y: 100 },
            ],
            confidence: "low",
          },
        ],
      }),
    );
    expect(warnings.some((w) => /unlabelled/i.test(w.message))).toBe(true);
  });

  it("marks stair rise and going as placeholders", () => {
    const { level, warnings } = importLevel(
      baseExtraction({
        stairs: [
          {
            ref: "s1",
            originPx: { x: 100, y: 100 },
            directionDeg: 90,
            widthPx: 90,
            countedTreads: 12,
            type: "straight",
            confidence: "medium",
          },
        ],
      }),
    );
    expect(level.stairs[0].risers).toBe(13);
    expect(warnings.some((w) => /measure/i.test(w.message))).toBe(true);
  });

  it("always warns that storey heights are placeholders", () => {
    const { warnings } = importLevel(baseExtraction());
    expect(warnings.some((w) => w.code === "assumed-storey-height")).toBe(true);
  });

  it("passes extractor notes through as warnings", () => {
    const { warnings } = importLevel(
      baseExtraction({ notes: ["The bay window is cut off at the page edge."] }),
    );
    expect(
      warnings.find((w) => w.code === "extractor-note")?.message,
    ).toMatch(/bay window/);
  });

  it("gives unique ids even when refs collide after sanitising", () => {
    const { level } = importLevel(
      baseExtraction({
        walls: [
          {
            ref: "w 1",
            startPx: { x: 0, y: 0 },
            endPx: { x: 100, y: 0 },
            thicknessPx: 10,
            kind: "internal",
            confidence: "high",
          },
          {
            ref: "w/1",
            startPx: { x: 0, y: 100 },
            endPx: { x: 100, y: 100 },
            thicknessPx: 10,
            kind: "internal",
            confidence: "high",
          },
        ],
      }),
    );
    expect(new Set(level.walls.map((w) => w.id)).size).toBe(2);
  });
});

describe("rescaleLevel", () => {
  it("scales every dimension by the same factor", () => {
    const { level } = importLevel(
      baseExtraction({
        openings: [
          {
            ref: "d1",
            wallRef: "w1",
            type: "door",
            centrePx: { x: 250, y: 0 },
            widthPx: 90,
            confidence: "high",
          },
        ],
        rooms: [
          {
            ref: "r1",
            name: "Hall",
            use: "circulation",
            polygonPx: [
              { x: 0, y: 0 },
              { x: 100, y: 0 },
              { x: 100, y: 100 },
            ],
            confidence: "high",
          },
        ],
      }),
    );
    const scaled = rescaleLevel(level, 1.1);
    expect(scaled.walls[0].end.x).toBeCloseTo(5500, 0);
    expect(scaled.walls[0].thicknessMm).toBeCloseTo(330, 0);
    expect(scaled.openings[0].widthMm).toBeCloseTo(990, 0);
    expect(scaled.rooms[0].polygon[1].x).toBeCloseTo(1100, 0);
  });

  it("is a no-op at factor 1", () => {
    const { level } = importLevel(baseExtraction());
    expect(rescaleLevel(level, 1)).toEqual(level);
  });
});
