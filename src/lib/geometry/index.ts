import type { Point, Wall } from "@/lib/model/schema";

/** Editor snap increment in millimetres. */
export const SNAP_MM = 50;

/** Angle within which a wall is pulled onto the horizontal / vertical axis. */
export const ORTHO_TOLERANCE_DEG = 7;

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function snapValue(value: number, increment = SNAP_MM): number {
  return Math.round(value / increment) * increment;
}

export function snapPoint(p: Point, increment = SNAP_MM): Point {
  return { x: snapValue(p.x, increment), y: snapValue(p.y, increment) };
}

export function angleDeg(from: Point, to: Point): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

/**
 * Pull `moving` onto a horizontal or vertical line through `anchor` when it is
 * already within ORTHO_TOLERANCE_DEG of one, preserving the wall's length along
 * the dominant axis. Angles that are clearly diagonal are left alone, so
 * genuinely splayed bay walls survive editing.
 */
export function constrainOrthogonal(
  anchor: Point,
  moving: Point,
  toleranceDeg = ORTHO_TOLERANCE_DEG,
): Point {
  const dx = moving.x - anchor.x;
  const dy = moving.y - anchor.y;
  if (dx === 0 && dy === 0) return moving;

  // Angle to the nearest axis, 0..45.
  const a = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI); // 0..180
  const toHorizontal = Math.min(a, 180 - a);
  const toVertical = Math.abs(90 - a);

  if (toHorizontal <= toleranceDeg && toHorizontal <= toVertical) {
    return { x: moving.x, y: anchor.y };
  }
  if (toVertical <= toleranceDeg) {
    return { x: anchor.x, y: moving.y };
  }
  return moving;
}

/** Shoelace area in mm², always positive. */
export function polygonAreaMm2(polygon: Point[]): number {
  if (polygon.length < 3) return 0;
  let twice = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

export function polygonAreaM2(polygon: Point[]): number {
  return polygonAreaMm2(polygon) / 1_000_000;
}

export function wallLengthMm(wall: Pick<Wall, "start" | "end">): number {
  return distance(wall.start, wall.end);
}

/**
 * Position of a point at `offsetMm` along a wall, used to place openings.
 * Offsets beyond the wall length are clamped so geometry never inverts.
 */
export function pointAlongWall(
  wall: Pick<Wall, "start" | "end">,
  offsetMm: number,
): Point {
  const len = wallLengthMm(wall);
  if (len === 0) return { ...wall.start };
  const t = Math.min(Math.max(offsetMm / len, 0), 1);
  return {
    x: wall.start.x + (wall.end.x - wall.start.x) * t,
    y: wall.start.y + (wall.end.y - wall.start.y) * t,
  };
}

/** Perpendicular distance from `p` to the infinite line through the wall. */
export function distanceToSegment(
  p: Point,
  a: Point,
  b: Point,
): { distance: number; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { distance: distance(p, a), t: 0 };
  const rawT = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  const t = Math.min(Math.max(rawT, 0), 1);
  const closest = { x: a.x + dx * t, y: a.y + dy * t };
  return { distance: distance(p, closest), t };
}

/** Nearest wall to a model-space point, or null when none is within `maxMm`. */
export function findNearestWall(
  walls: Wall[],
  p: Point,
  maxMm = 300,
): { wall: Wall; distance: number; offsetMm: number } | null {
  let best: { wall: Wall; distance: number; offsetMm: number } | null = null;
  for (const wall of walls) {
    const { distance: d, t } = distanceToSegment(p, wall.start, wall.end);
    if (d <= maxMm && (best === null || d < best.distance)) {
      best = { wall, distance: d, offsetMm: t * wallLengthMm(wall) };
    }
  }
  return best;
}

/** Axis-aligned bounds of every wall endpoint on a level, in mm. */
export function boundsOf(walls: Wall[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  if (walls.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const w of walls) {
    for (const p of [w.start, w.end]) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  return { minX, minY, maxX, maxY };
}

export function formatMm(mm: number): string {
  const rounded = Math.round(mm);
  if (Math.abs(rounded) >= 1000) {
    return `${(rounded / 1000).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")} m`;
  }
  return `${rounded} mm`;
}
