"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Point, Wall } from "@/lib/model/schema";
import { useActiveLevel, useProjectStore } from "@/state/projectStore";
import {
  constrainOrthogonal,
  distance,
  findNearestWall,
  formatMm,
  pointAlongWall,
  snapPoint,
  wallLengthMm,
} from "@/lib/geometry";
import { mmToPixel } from "@/lib/calibration/calibration";
import { IMPORT_DEFAULTS, NEW_ELEMENT_DEFAULTS } from "@/lib/model/importDefaults";

/** Snap a dragged endpoint to another wall's endpoint within this distance. */
const VERTEX_SNAP_MM = 200;
/** How far from a wall a door/window click still counts as "on that wall". */
const OPENING_PICK_MM = 500;

type Props = {
  mode: "edit" | "calibrate";
  calibrationPoints: Point[];
  onCalibrationPick: (imagePoint: Point) => void;
};

type DragState = { wallId: string; end: "start" | "end" } | null;

const STATUS_COLOUR: Record<Wall["status"], string> = {
  existing: "#4b5563",
  proposed: "#2563eb",
  demolish: "#dc2626",
};

export function PlanCanvas({ mode, calibrationPoints, onCalibrationPick }: Props) {
  const activeLevelIndex = useProjectStore((s) => s.activeLevelIndex);
  const page = useProjectStore((s) => s.planImages[s.activeLevelIndex]);
  const calibration = useProjectStore((s) => s.calibrations[s.activeLevelIndex]);
  const tool = useProjectStore((s) => s.tool);
  const selection = useProjectStore((s) => s.selection);
  const select = useProjectStore((s) => s.select);
  const addWall = useProjectStore((s) => s.addWall);
  const updateWall = useProjectStore((s) => s.updateWall);
  const deleteWall = useProjectStore((s) => s.deleteWall);
  const addOpening = useProjectStore((s) => s.addOpening);
  const deleteOpening = useProjectStore((s) => s.deleteOpening);
  const setError = useProjectStore((s) => s.setError);
  const level = useActiveLevel();

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [zoom, setZoom] = useState(0.6);
  const [cursorMm, setCursorMm] = useState<Point | null>(null);
  const [pendingWallStart, setPendingWallStart] = useState<Point | null>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const [hoverWallId, setHoverWallId] = useState<string | null>(null);
  const [orthoOff, setOrthoOff] = useState(false);

  // Alt suspends orthogonal snapping while held, for genuinely splayed walls.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Alt") setOrthoOff(true);
      if (e.key === "Escape") {
        setPendingWallStart(null);
        select(null);
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selection) {
        const target = e.target as HTMLElement | null;
        if (target && /input|textarea|select/i.test(target.tagName)) return;
        e.preventDefault();
        if (selection.kind === "wall") deleteWall(selection.id);
        if (selection.kind === "opening") deleteOpening(selection.id);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Alt") setOrthoOff(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [selection, deleteWall, deleteOpening, select]);

  const mmPerPixel = calibration?.mmPerPixel ?? null;

  const toImagePx = useCallback(
    (event: { clientX: number; clientY: number }): Point | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) / zoom,
        y: (event.clientY - rect.top) / zoom,
      };
    },
    [zoom],
  );

  const toMm = useCallback(
    (imagePx: Point): Point | null => {
      if (!mmPerPixel) return null;
      return { x: imagePx.x * mmPerPixel, y: imagePx.y * mmPerPixel };
    },
    [mmPerPixel],
  );

  const toPx = useCallback(
    (mm: Point): Point =>
      calibration ? mmToPixel(mm, calibration) : { x: 0, y: 0 },
    [calibration],
  );

  /** All wall endpoints except the one being dragged, for vertex snapping. */
  const snapTargets = useMemo(() => {
    if (!level) return [];
    const points: Point[] = [];
    for (const wall of level.walls) {
      if (drag && wall.id === drag.wallId) continue;
      points.push(wall.start, wall.end);
    }
    return points;
  }, [level, drag]);

  const snapMm = useCallback(
    (raw: Point, anchor?: Point): Point => {
      let candidate = raw;
      if (anchor && !orthoOff) candidate = constrainOrthogonal(anchor, candidate);
      // A nearby existing corner beats the 50mm grid: junctions must close.
      let best: { point: Point; d: number } | null = null;
      for (const target of snapTargets) {
        const d = distance(candidate, target);
        if (d <= VERTEX_SNAP_MM && (!best || d < best.d)) best = { point: target, d };
      }
      return best ? { ...best.point } : snapPoint(candidate);
    },
    [snapTargets, orthoOff],
  );

  function handleBackgroundPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    const imagePx = toImagePx(event);
    if (!imagePx) return;

    if (mode === "calibrate") {
      onCalibrationPick(imagePx);
      return;
    }

    const mm = toMm(imagePx);
    if (!mm) {
      setError("Calibrate this plan before editing geometry.");
      return;
    }

    if (tool === "select") {
      select(null);
      return;
    }

    if (tool === "draw-wall") {
      const point = snapMm(mm, pendingWallStart ?? undefined);
      if (!pendingWallStart) {
        setPendingWallStart(point);
        return;
      }
      if (distance(pendingWallStart, point) < 50) {
        setPendingWallStart(null);
        return;
      }
      const id = addWall({
        start: pendingWallStart,
        end: point,
        thicknessMm: NEW_ELEMENT_DEFAULTS.internalWallThicknessMm,
        kind: "internal",
        structural: "unknown",
        status: "proposed",
      });
      setPendingWallStart(null);
      select({ kind: "wall", id });
      return;
    }

    if (tool === "add-door" || tool === "add-window") {
      if (!level) return;
      const hit = findNearestWall(level.walls, mm, OPENING_PICK_MM);
      if (!hit) {
        setError("Click on a wall to place an opening in it.");
        return;
      }
      const isDoor = tool === "add-door";
      const widthMm = isDoor
        ? NEW_ELEMENT_DEFAULTS.doorWidthMm
        : NEW_ELEMENT_DEFAULTS.windowWidthMm;
      const wallLength = wallLengthMm(hit.wall);
      if (wallLength <= widthMm) {
        setError("That wall is too short for this opening.");
        return;
      }
      const offsetMm = Math.min(
        Math.max(hit.offsetMm - widthMm / 2, 0),
        wallLength - widthMm,
      );
      const id = addOpening({
        wallId: hit.wall.id,
        type: isDoor ? "door" : "window",
        offsetMm: Math.round(offsetMm),
        widthMm,
        heightMm: isDoor
          ? IMPORT_DEFAULTS.doorHeightMm
          : IMPORT_DEFAULTS.windowHeightMm,
        sillMm: isDoor ? 0 : IMPORT_DEFAULTS.windowSillMm,
        status: "proposed",
      });
      select({ kind: "opening", id });
    }
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const imagePx = toImagePx(event);
    if (!imagePx) return;
    const mm = toMm(imagePx);
    setCursorMm(mm);

    if (drag && mm && level) {
      const wall = level.walls.find((w) => w.id === drag.wallId);
      if (!wall) return;
      const anchor = drag.end === "start" ? wall.end : wall.start;
      const moved = snapMm(mm, anchor);
      updateWall(wall.id, { [drag.end]: moved } as Partial<Wall>);
    }
  }

  function startDrag(
    event: React.PointerEvent<SVGCircleElement>,
    wallId: string,
    end: "start" | "end",
  ) {
    event.stopPropagation();
    (event.target as Element).setPointerCapture?.(event.pointerId);
    setDrag({ wallId, end });
    select({ kind: "wall", id: wallId });
  }

  if (!page) {
    return (
      <div className="flex h-full items-center justify-center bg-neutral-100 text-sm text-neutral-500">
        Upload a floor plan for this level to begin.
      </div>
    );
  }

  const handleRadius = 6 / zoom;
  const cursorStyle =
    mode === "calibrate"
      ? "crosshair"
      : tool === "select"
        ? "default"
        : "crosshair";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-neutral-200 bg-white px-3 py-1.5 text-xs">
        <button
          onClick={() => setZoom((z) => Math.max(0.1, z - 0.15))}
          className="rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-100"
        >
          −
        </button>
        <span className="w-12 text-center tabular-nums">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom((z) => Math.min(6, z + 0.15))}
          className="rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-100"
        >
          +
        </button>
        <span className="ml-3 text-neutral-500">
          {mode === "calibrate"
            ? `Click two points you know the real distance between (${calibrationPoints.length}/2)`
            : mmPerPixel
              ? "Drag endpoints to edit · Alt disables right-angle snap · Delete removes the selection"
              : "Not calibrated yet — set the scale before editing"}
        </span>
        {cursorMm && mmPerPixel && (
          <span className="ml-auto tabular-nums text-neutral-500">
            x {formatMm(cursorMm.x)} · y {formatMm(cursorMm.y)}
          </span>
        )}
      </div>

      <div className="relative flex-1 overflow-auto bg-neutral-200 p-4">
        <div
          className="relative mx-auto"
          style={{ width: page.widthPx * zoom, height: page.heightPx * zoom }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={page.dataUrl}
            alt={`Floor plan for level ${activeLevelIndex}`}
            className="plan-image absolute inset-0 bg-white"
            style={{ width: page.widthPx * zoom, height: page.heightPx * zoom }}
            draggable={false}
          />
          <svg
            ref={svgRef}
            viewBox={`0 0 ${page.widthPx} ${page.heightPx}`}
            className="absolute inset-0"
            style={{
              width: page.widthPx * zoom,
              height: page.heightPx * zoom,
              cursor: cursorStyle,
            }}
            onPointerDown={handleBackgroundPointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={() => setDrag(null)}
            onPointerLeave={() => {
              setDrag(null);
              setCursorMm(null);
            }}
          >
            {/* Calibration picks */}
            {calibrationPoints.map((point, index) => (
              <g key={index}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={handleRadius}
                  fill="#f97316"
                  stroke="#fff"
                  strokeWidth={1.5 / zoom}
                />
                <text
                  x={point.x + handleRadius * 1.5}
                  y={point.y - handleRadius}
                  fontSize={12 / zoom}
                  fill="#f97316"
                >
                  {index === 0 ? "A" : "B"}
                </text>
              </g>
            ))}
            {calibrationPoints.length === 2 && (
              <line
                x1={calibrationPoints[0].x}
                y1={calibrationPoints[0].y}
                x2={calibrationPoints[1].x}
                y2={calibrationPoints[1].y}
                stroke="#f97316"
                strokeWidth={1.5 / zoom}
                strokeDasharray={`${6 / zoom} ${4 / zoom}`}
              />
            )}

            {/* Rooms */}
            {calibration &&
              level?.rooms.map((room) => {
                const points = room.polygon
                  .map((p) => {
                    const px = toPx(p);
                    return `${px.x},${px.y}`;
                  })
                  .join(" ");
                const isSelected =
                  selection?.kind === "room" && selection.id === room.id;
                const centroid = room.polygon.reduce(
                  (acc, p) => ({
                    x: acc.x + p.x / room.polygon.length,
                    y: acc.y + p.y / room.polygon.length,
                  }),
                  { x: 0, y: 0 },
                );
                const labelPx = toPx(centroid);
                return (
                  <g key={room.id}>
                    <polygon
                      points={points}
                      fill={isSelected ? "rgba(37,99,235,0.18)" : "rgba(37,99,235,0.07)"}
                      stroke={isSelected ? "#2563eb" : "transparent"}
                      strokeWidth={1.5 / zoom}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        if (mode === "calibrate") {
                          const px = toImagePx(e);
                          if (px) onCalibrationPick(px);
                          return;
                        }
                        select({ kind: "room", id: room.id });
                      }}
                    />
                    <text
                      x={labelPx.x}
                      y={labelPx.y}
                      fontSize={13 / zoom}
                      textAnchor="middle"
                      fill="#1e3a8a"
                      className="pointer-events-none select-none"
                    >
                      {room.name}
                    </text>
                  </g>
                );
              })}

            {/* Walls */}
            {calibration &&
              level?.walls.map((wall) => {
                const a = toPx(wall.start);
                const b = toPx(wall.end);
                const isSelected =
                  selection?.kind === "wall" && selection.id === wall.id;
                const isHovered = hoverWallId === wall.id;
                const thicknessPx = wall.thicknessMm / (mmPerPixel ?? 1);
                return (
                  <g key={wall.id}>
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={STATUS_COLOUR[wall.status]}
                      strokeOpacity={isSelected ? 0.95 : 0.65}
                      strokeWidth={Math.max(thicknessPx, 2 / zoom)}
                      strokeLinecap="butt"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        if (mode === "calibrate") {
                          const px = toImagePx(e);
                          if (px) onCalibrationPick(px);
                          return;
                        }
                        if (tool === "add-door" || tool === "add-window") {
                          handleBackgroundPointerDown(
                            e as unknown as React.PointerEvent<SVGSVGElement>,
                          );
                          return;
                        }
                        select({ kind: "wall", id: wall.id });
                      }}
                      onPointerEnter={() => setHoverWallId(wall.id)}
                      onPointerLeave={() =>
                        setHoverWallId((id) => (id === wall.id ? null : id))
                      }
                      style={{ cursor: mode === "edit" ? "pointer" : cursorStyle }}
                    />
                    {(isSelected || isHovered) && (
                      <text
                        x={(a.x + b.x) / 2}
                        y={(a.y + b.y) / 2 - 8 / zoom}
                        fontSize={12 / zoom}
                        textAnchor="middle"
                        fill="#111827"
                        stroke="#ffffff"
                        strokeWidth={3 / zoom}
                        paintOrder="stroke"
                        className="pointer-events-none select-none"
                      >
                        {formatMm(wallLengthMm(wall))}
                      </text>
                    )}
                    {isSelected && mode === "edit" && (
                      <>
                        <circle
                          cx={a.x}
                          cy={a.y}
                          r={handleRadius}
                          fill="#ffffff"
                          stroke="#2563eb"
                          strokeWidth={2 / zoom}
                          style={{ cursor: "grab" }}
                          onPointerDown={(e) => startDrag(e, wall.id, "start")}
                        />
                        <circle
                          cx={b.x}
                          cy={b.y}
                          r={handleRadius}
                          fill="#ffffff"
                          stroke="#2563eb"
                          strokeWidth={2 / zoom}
                          style={{ cursor: "grab" }}
                          onPointerDown={(e) => startDrag(e, wall.id, "end")}
                        />
                      </>
                    )}
                  </g>
                );
              })}

            {/* Openings */}
            {calibration &&
              level?.openings.map((opening) => {
                const wall = level.walls.find((w) => w.id === opening.wallId);
                if (!wall) return null;
                const startMm = pointAlongWall(wall, opening.offsetMm);
                const endMm = pointAlongWall(
                  wall,
                  opening.offsetMm + opening.widthMm,
                );
                const a = toPx(startMm);
                const b = toPx(endMm);
                const isSelected =
                  selection?.kind === "opening" && selection.id === opening.id;
                const thicknessPx = wall.thicknessMm / (mmPerPixel ?? 1);
                return (
                  <line
                    key={opening.id}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={
                      isSelected
                        ? "#f59e0b"
                        : opening.type === "door"
                          ? "#ffffff"
                          : "#7dd3fc"
                    }
                    strokeWidth={Math.max(thicknessPx * 0.9, 2 / zoom)}
                    strokeLinecap="butt"
                    style={{ cursor: "pointer" }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      if (mode === "calibrate") {
                        const px = toImagePx(e);
                        if (px) onCalibrationPick(px);
                        return;
                      }
                      select({ kind: "opening", id: opening.id });
                    }}
                  />
                );
              })}

            {/* Wall being drawn */}
            {pendingWallStart && cursorMm && calibration && (
              <line
                x1={toPx(pendingWallStart).x}
                y1={toPx(pendingWallStart).y}
                x2={toPx(snapMm(cursorMm, pendingWallStart)).x}
                y2={toPx(snapMm(cursorMm, pendingWallStart)).y}
                stroke="#2563eb"
                strokeWidth={2 / zoom}
                strokeDasharray={`${6 / zoom} ${4 / zoom}`}
              />
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}
