import { describe, expect, it } from "vitest";
import {
  boundsOf,
  constrainOrthogonal,
  distanceToSegment,
  findNearestWall,
  formatMm,
  pointAlongWall,
  polygonAreaM2,
  snapPoint,
  snapValue,
} from "./index";
import type { Wall } from "@/lib/model/schema";

const wall = (
  id: string,
  start: [number, number],
  end: [number, number],
): Wall => ({
  id,
  start: { x: start[0], y: start[1] },
  end: { x: end[0], y: end[1] },
  thicknessMm: 100,
  kind: "internal",
  structural: "unknown",
  status: "existing",
});

describe("snapping", () => {
  it("snaps to the nearest 50mm", () => {
    expect(snapValue(1234)).toBe(1250);
    expect(snapValue(1224)).toBe(1200);
    expect(snapValue(-1234)).toBe(-1250);
  });

  it("snaps both axes of a point", () => {
    expect(snapPoint({ x: 3011, y: 2489 })).toEqual({ x: 3000, y: 2500 });
  });
});

describe("constrainOrthogonal", () => {
  it("flattens a nearly horizontal wall onto the anchor's y", () => {
    const result = constrainOrthogonal({ x: 0, y: 0 }, { x: 4000, y: 120 });
    expect(result).toEqual({ x: 4000, y: 0 });
  });

  it("flattens a nearly vertical wall onto the anchor's x", () => {
    const result = constrainOrthogonal({ x: 0, y: 0 }, { x: 90, y: 3000 });
    expect(result).toEqual({ x: 0, y: 3000 });
  });

  it("leaves a genuine diagonal alone", () => {
    const moving = { x: 3000, y: 3000 };
    expect(constrainOrthogonal({ x: 0, y: 0 }, moving)).toEqual(moving);
  });

  it("leaves a splayed bay wall alone at 30 degrees", () => {
    const moving = { x: 3000, y: 1732 };
    expect(constrainOrthogonal({ x: 0, y: 0 }, moving)).toEqual(moving);
  });

  it("handles a zero-length drag without dividing by zero", () => {
    expect(constrainOrthogonal({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({
      x: 5,
      y: 5,
    });
  });

  it("works when the wall runs right-to-left", () => {
    // atan2 returns ~180 degrees here; the tolerance test must wrap.
    expect(constrainOrthogonal({ x: 4000, y: 0 }, { x: 0, y: 100 })).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe("polygon area", () => {
  it("computes a rectangle in square metres", () => {
    const poly = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 3000 },
      { x: 0, y: 3000 },
    ];
    expect(polygonAreaM2(poly)).toBeCloseTo(12, 6);
  });

  it("is sign-independent", () => {
    const poly = [
      { x: 0, y: 0 },
      { x: 0, y: 3000 },
      { x: 4000, y: 3000 },
      { x: 4000, y: 0 },
    ];
    expect(polygonAreaM2(poly)).toBeCloseTo(12, 6);
  });

  it("returns zero for a degenerate polygon", () => {
    expect(polygonAreaM2([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(0);
  });
});

describe("points along walls", () => {
  it("interpolates at an offset", () => {
    const w = wall("w1", [0, 0], [4000, 0]);
    expect(pointAlongWall(w, 1000)).toEqual({ x: 1000, y: 0 });
  });

  it("clamps past the end rather than extrapolating", () => {
    const w = wall("w1", [0, 0], [4000, 0]);
    expect(pointAlongWall(w, 9000)).toEqual({ x: 4000, y: 0 });
  });
});

describe("distanceToSegment", () => {
  it("measures perpendicular distance inside the segment", () => {
    const { distance, t } = distanceToSegment(
      { x: 2000, y: 500 },
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
    );
    expect(distance).toBe(500);
    expect(t).toBeCloseTo(0.5, 6);
  });

  it("clamps to the endpoint beyond the segment", () => {
    const { distance, t } = distanceToSegment(
      { x: 5000, y: 0 },
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
    );
    expect(distance).toBe(1000);
    expect(t).toBe(1);
  });
});

describe("findNearestWall", () => {
  const walls = [wall("a", [0, 0], [4000, 0]), wall("b", [0, 3000], [4000, 3000])];

  it("finds the closer wall and its offset", () => {
    const hit = findNearestWall(walls, { x: 1000, y: 100 });
    expect(hit?.wall.id).toBe("a");
    expect(hit?.offsetMm).toBeCloseTo(1000, 6);
  });

  it("returns null when nothing is within range", () => {
    expect(findNearestWall(walls, { x: 1000, y: 1500 }, 300)).toBeNull();
  });
});

describe("boundsOf", () => {
  it("returns null for no walls", () => {
    expect(boundsOf([])).toBeNull();
  });

  it("covers every endpoint", () => {
    const walls = [wall("a", [0, 0], [4000, 0]), wall("b", [-500, 3000], [4000, 3000])];
    expect(boundsOf(walls)).toEqual({
      minX: -500,
      minY: 0,
      maxX: 4000,
      maxY: 3000,
    });
  });
});

describe("formatMm", () => {
  it("uses millimetres below a metre", () => {
    expect(formatMm(850)).toBe("850 mm");
  });

  it("uses metres above a metre and trims trailing zeros", () => {
    expect(formatMm(4000)).toBe("4 m");
    expect(formatMm(3450)).toBe("3.45 m");
  });
});
