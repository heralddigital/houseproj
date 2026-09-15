import { describe, expect, it } from "vitest";
import {
  buildCalibration,
  checkPrintedDimension,
  checkPrintedDimensions,
  mmToPixel,
  pixelLengthToMm,
  pixelToMm,
  suggestedMmPerPixel,
} from "./calibration";

const calibration = buildCalibration({
  levelIndex: 0,
  pointA: { x: 100, y: 100 },
  pointB: { x: 500, y: 100 },
  realDistanceMm: 4000,
  now: new Date("2026-09-15T10:00:00Z"),
});

describe("buildCalibration", () => {
  it("derives mm per pixel from the clicked span", () => {
    expect(calibration.mmPerPixel).toBe(10);
  });

  it("works on a diagonal span", () => {
    const diagonal = buildCalibration({
      levelIndex: 0,
      pointA: { x: 0, y: 0 },
      pointB: { x: 300, y: 400 },
      realDistanceMm: 5000,
    });
    expect(diagonal.mmPerPixel).toBe(10);
  });

  it("defaults the origin to the first clicked point", () => {
    expect(calibration.originPx).toEqual({ x: 100, y: 100 });
  });

  it("rejects two identical points", () => {
    expect(() =>
      buildCalibration({
        levelIndex: 0,
        pointA: { x: 10, y: 10 },
        pointB: { x: 10, y: 10 },
        realDistanceMm: 1000,
      }),
    ).toThrow(/identical/i);
  });

  it("rejects a non-positive distance", () => {
    expect(() =>
      buildCalibration({
        levelIndex: 0,
        pointA: { x: 0, y: 0 },
        pointB: { x: 100, y: 0 },
        realDistanceMm: 0,
      }),
    ).toThrow(/greater than zero/i);
  });
});

describe("pixel <-> mm", () => {
  it("puts the origin pixel at model 0,0", () => {
    expect(pixelToMm({ x: 100, y: 100 }, calibration)).toEqual({ x: 0, y: 0 });
  });

  it("scales and translates", () => {
    expect(pixelToMm({ x: 300, y: 250 }, calibration)).toEqual({
      x: 2000,
      y: 1500,
    });
  });

  it("round-trips back to pixels", () => {
    const px = { x: 412.5, y: 233.25 };
    const back = mmToPixel(pixelToMm(px, calibration), calibration);
    expect(back.x).toBeCloseTo(px.x, 9);
    expect(back.y).toBeCloseTo(px.y, 9);
  });

  it("converts a bare length without translating it", () => {
    expect(pixelLengthToMm(35, calibration)).toBe(350);
  });
});

describe("printed dimension cross-check", () => {
  it("agrees when the printed dimension matches the calibrated span", () => {
    const check = checkPrintedDimension(
      {
        label: "3,000",
        valueMm: 3000,
        fromPx: { x: 0, y: 0 },
        toPx: { x: 300, y: 0 },
      },
      calibration,
    );
    expect(check.calibratedMm).toBe(3000);
    expect(check.relativeError).toBe(0);
    expect(check.disagrees).toBe(false);
  });

  it("stays silent just inside the 2% tolerance", () => {
    // 306px * 10mm = 3060mm against a printed 3000mm -> +2.0%
    const check = checkPrintedDimension(
      {
        label: "3,000",
        valueMm: 3000,
        fromPx: { x: 0, y: 0 },
        toPx: { x: 306, y: 0 },
      },
      calibration,
    );
    expect(check.relativeError).toBeCloseTo(0.02, 9);
    expect(check.disagrees).toBe(false);
  });

  it("flags a disagreement past 2%", () => {
    const check = checkPrintedDimension(
      {
        label: "3,000",
        valueMm: 3000,
        fromPx: { x: 0, y: 0 },
        toPx: { x: 320, y: 0 },
      },
      calibration,
    );
    expect(check.relativeError).toBeCloseTo(0.0667, 3);
    expect(check.disagrees).toBe(true);
  });

  it("flags an undersized calibration too", () => {
    const check = checkPrintedDimension(
      {
        label: "3,000",
        valueMm: 3000,
        fromPx: { x: 0, y: 0 },
        toPx: { x: 280, y: 0 },
      },
      calibration,
    );
    expect(check.relativeError).toBeLessThan(0);
    expect(check.disagrees).toBe(true);
  });

  it("checks a whole list", () => {
    const checks = checkPrintedDimensions(
      [
        {
          label: "3,000",
          valueMm: 3000,
          fromPx: { x: 0, y: 0 },
          toPx: { x: 300, y: 0 },
        },
        {
          label: "5,000",
          valueMm: 5000,
          fromPx: { x: 0, y: 0 },
          toPx: { x: 560, y: 0 },
        },
      ],
      calibration,
    );
    expect(checks.map((c) => c.disagrees)).toEqual([false, true]);
  });
});

describe("suggestedMmPerPixel", () => {
  it("returns the median implied scale", () => {
    const suggestion = suggestedMmPerPixel([
      { label: "a", valueMm: 3000, fromPx: { x: 0, y: 0 }, toPx: { x: 300, y: 0 } },
      { label: "b", valueMm: 4000, fromPx: { x: 0, y: 0 }, toPx: { x: 500, y: 0 } },
      { label: "c", valueMm: 2000, fromPx: { x: 0, y: 0 }, toPx: { x: 200, y: 0 } },
    ]);
    // implied scales: 10, 8, 10 -> median 10
    expect(suggestion).toBe(10);
  });

  it("averages the middle pair for an even count", () => {
    const suggestion = suggestedMmPerPixel([
      { label: "a", valueMm: 3000, fromPx: { x: 0, y: 0 }, toPx: { x: 300, y: 0 } },
      { label: "b", valueMm: 4000, fromPx: { x: 0, y: 0 }, toPx: { x: 500, y: 0 } },
    ]);
    expect(suggestion).toBe(9);
  });

  it("returns null when there is nothing usable", () => {
    expect(suggestedMmPerPixel([])).toBeNull();
    expect(
      suggestedMmPerPixel([
        { label: "a", valueMm: 3000, fromPx: { x: 5, y: 5 }, toPx: { x: 5, y: 5 } },
      ]),
    ).toBeNull();
  });
});
