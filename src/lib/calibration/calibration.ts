import type { Calibration, Point } from "@/lib/model/schema";
import { distance } from "@/lib/geometry";

/**
 * Calibration converts plan-image pixels into model millimetres.
 *
 * It is deliberately a uniform scale plus a translation: no rotation, no
 * shear, no per-axis scale. A scanned plan that needs any of those is
 * distorted, and silently fitting an affine transform to two clicked points
 * would hide that. Rotation correction, if it is ever needed, belongs in a
 * separate de-skew step before calibration.
 */

/** Threshold above which a printed dimension is treated as disagreeing. */
export const DIMENSION_TOLERANCE = 0.02; // 2%

export function buildCalibration(params: {
  levelIndex: number;
  pointA: Point;
  pointB: Point;
  realDistanceMm: number;
  /** Image pixel to treat as model origin. Defaults to pointA. */
  originPx?: Point;
  now?: Date;
}): Calibration {
  const pixelDistance = distance(params.pointA, params.pointB);
  if (pixelDistance === 0) {
    throw new Error(
      "Calibration points are identical — click two distinct points on the plan.",
    );
  }
  if (!(params.realDistanceMm > 0)) {
    throw new Error("Calibration distance must be greater than zero.");
  }
  return {
    levelIndex: params.levelIndex,
    pointA: params.pointA,
    pointB: params.pointB,
    realDistanceMm: params.realDistanceMm,
    mmPerPixel: params.realDistanceMm / pixelDistance,
    originPx: params.originPx ?? params.pointA,
    calibratedAt: (params.now ?? new Date()).toISOString(),
  };
}

export function pixelToMm(px: Point, calibration: Calibration): Point {
  return {
    x: (px.x - calibration.originPx.x) * calibration.mmPerPixel,
    y: (px.y - calibration.originPx.y) * calibration.mmPerPixel,
  };
}

export function mmToPixel(mm: Point, calibration: Calibration): Point {
  return {
    x: mm.x / calibration.mmPerPixel + calibration.originPx.x,
    y: mm.y / calibration.mmPerPixel + calibration.originPx.y,
  };
}

export function pixelLengthToMm(
  lengthPx: number,
  calibration: Calibration,
): number {
  return lengthPx * calibration.mmPerPixel;
}

/**
 * A dimension string the extractor read off the drawing, together with the two
 * pixel points it labels. Comparing the printed value against the calibrated
 * pixel span is the only independent check we have on the scale.
 */
export type PrintedDimension = {
  label: string;
  valueMm: number;
  fromPx: Point;
  toPx: Point;
};

export type DimensionCheck = {
  label: string;
  printedMm: number;
  calibratedMm: number;
  /** Signed relative error: positive when the calibrated span is longer. */
  relativeError: number;
  disagrees: boolean;
};

export function checkPrintedDimension(
  dimension: PrintedDimension,
  calibration: Calibration,
  tolerance = DIMENSION_TOLERANCE,
): DimensionCheck {
  const calibratedMm = pixelLengthToMm(
    distance(dimension.fromPx, dimension.toPx),
    calibration,
  );
  const relativeError =
    dimension.valueMm === 0
      ? 0
      : (calibratedMm - dimension.valueMm) / dimension.valueMm;
  return {
    label: dimension.label,
    printedMm: dimension.valueMm,
    calibratedMm,
    relativeError,
    disagrees: Math.abs(relativeError) > tolerance,
  };
}

export function checkPrintedDimensions(
  dimensions: PrintedDimension[],
  calibration: Calibration,
  tolerance = DIMENSION_TOLERANCE,
): DimensionCheck[] {
  return dimensions.map((d) => checkPrintedDimension(d, calibration, tolerance));
}

/**
 * The scale the printed dimensions imply, independent of the clicked points.
 * Offered as a one-click correction when the two disagree.
 */
export function suggestedMmPerPixel(
  dimensions: PrintedDimension[],
): number | null {
  const ratios = dimensions
    .map((d) => {
      const px = distance(d.fromPx, d.toPx);
      return px > 0 ? d.valueMm / px : null;
    })
    .filter((r): r is number => r !== null)
    .sort((a, b) => a - b);
  if (ratios.length === 0) return null;
  const mid = Math.floor(ratios.length / 2);
  return ratios.length % 2 === 1
    ? ratios[mid]
    : (ratios[mid - 1] + ratios[mid]) / 2;
}
