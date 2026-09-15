"use client";

import { useState } from "react";
import type { Point } from "@/lib/model/schema";
import { useProjectStore } from "@/state/projectStore";
import { distance, formatMm } from "@/lib/geometry";

type Props = {
  mode: "edit" | "calibrate";
  setMode: (mode: "edit" | "calibrate") => void;
  points: Point[];
  setPoints: (points: Point[]) => void;
};

export function CalibrationPanel({ mode, setMode, points, setPoints }: Props) {
  const activeLevelIndex = useProjectStore((s) => s.activeLevelIndex);
  const calibration = useProjectStore((s) => s.calibrations[s.activeLevelIndex]);
  const checks = useProjectStore((s) => s.dimensionChecks[s.activeLevelIndex]);
  const applyCalibration = useProjectStore((s) => s.applyCalibration);
  const acceptSuggestedScale = useProjectStore((s) => s.acceptSuggestedScale);
  const page = useProjectStore((s) => s.planImages[s.activeLevelIndex]);

  const [distanceText, setDistanceText] = useState("");

  const disagreements = (checks ?? []).filter((c) => c.disagrees);

  function apply() {
    const realDistanceMm = Number(distanceText);
    if (!Number.isFinite(realDistanceMm) || realDistanceMm <= 0) {
      return;
    }
    applyCalibration({
      levelIndex: activeLevelIndex,
      pointA: points[0],
      pointB: points[1],
      realDistanceMm,
    });
    setMode("edit");
    setPoints([]);
    setDistanceText("");
  }

  if (!page) return null;

  return (
    <section className="border-b border-neutral-200 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        2 · Calibration
      </h2>

      {calibration ? (
        <p className="mt-2 text-xs text-neutral-600">
          Scale set: <strong>{calibration.mmPerPixel.toFixed(3)} mm</strong> per
          pixel ({formatMm(calibration.realDistanceMm)} across{" "}
          {distance(calibration.pointA, calibration.pointB).toFixed(0)} px).
        </p>
      ) : (
        <p className="mt-2 text-xs text-amber-700">
          Not calibrated. Nothing has a real size until you set the scale.
        </p>
      )}

      {mode === "calibrate" ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-neutral-600">
            Click two points on the plan whose real distance you know — an
            external wall face to face, or the ends of a printed dimension.
            Picked: {points.length}/2
          </p>
          {points.length === 2 && (
            <>
              <label className="block text-xs text-neutral-600">
                Real distance in millimetres
                <input
                  autoFocus
                  value={distanceText}
                  onChange={(e) => setDistanceText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") apply();
                  }}
                  inputMode="numeric"
                  placeholder="e.g. 3450"
                  className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-500"
                />
              </label>
              <button
                onClick={apply}
                className="w-full rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700"
              >
                Apply scale
              </button>
            </>
          )}
          <button
            onClick={() => {
              setPoints([]);
              setMode("edit");
            }}
            className="w-full rounded border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => {
            setPoints([]);
            setMode("calibrate");
          }}
          className="mt-3 w-full rounded border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-100"
        >
          {calibration ? "Re-calibrate" : "Set scale from two points"}
        </button>
      )}

      {checks && checks.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-neutral-700">
            Printed dimensions cross-check
          </p>
          <ul className="mt-1 space-y-1">
            {checks.map((check, index) => (
              <li
                key={`${check.label}-${index}`}
                className={`flex items-baseline justify-between gap-2 rounded px-2 py-1 text-xs ${
                  check.disagrees
                    ? "bg-amber-50 text-amber-900"
                    : "bg-neutral-50 text-neutral-600"
                }`}
              >
                <span className="font-mono">{check.label}</span>
                <span className="tabular-nums">
                  {Math.round(check.calibratedMm)} mm scaled ·{" "}
                  {(check.relativeError * 100).toFixed(1)}%
                </span>
              </li>
            ))}
          </ul>
          {disagreements.length > 0 && (
            <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2">
              <p className="text-xs text-amber-900">
                {disagreements.length} printed dimension
                {disagreements.length === 1 ? "" : "s"} disagree with your
                calibration by more than 2%. Either the points you clicked were
                slightly off, or the drawing is not to a uniform scale.
              </p>
              <button
                onClick={() => acceptSuggestedScale(activeLevelIndex)}
                className="mt-2 w-full rounded border border-amber-400 bg-white px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
              >
                Rescale to match the printed dimensions instead
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
