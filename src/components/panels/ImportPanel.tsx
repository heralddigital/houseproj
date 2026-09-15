"use client";

import { useState } from "react";
import { loadPlanFile, type LoadedPlanPage } from "@/lib/plan/loadPlan";
import { useProjectStore } from "@/state/projectStore";
import { levelNameFor } from "@/lib/model/factory";

const LEVEL_CHOICES = [-1, 0, 1, 2];

export function ImportPanel() {
  const activeLevelIndex = useProjectStore((s) => s.activeLevelIndex);
  const setPlanImage = useProjectStore((s) => s.setPlanImage);
  const runExtraction = useProjectStore((s) => s.runExtraction);
  const extraction = useProjectStore((s) => s.extractions[s.activeLevelIndex]);
  const page = useProjectStore((s) => s.planImages[s.activeLevelIndex]);
  const busy = useProjectStore((s) => s.busy);
  const setError = useProjectStore((s) => s.setError);

  const [pages, setPages] = useState<LoadedPlanPage[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [hints, setHints] = useState("");

  async function onFile(file: File | undefined) {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const loaded = await loadPlanFile(file);
      if (loaded.length === 1) {
        setPlanImage(activeLevelIndex, loaded[0]);
        setPages(null);
      } else {
        // Multi-page PDF: you say which page is which storey. Guessing the
        // order of drawings in a survey PDF is how levels end up swapped.
        setPages(loaded);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not read that file.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="border-b border-neutral-200 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        1 · Plan import
      </h2>

      <label className="mt-3 block cursor-pointer rounded border border-dashed border-neutral-300 bg-neutral-50 px-3 py-4 text-center text-sm text-neutral-600 hover:border-neutral-400">
        <input
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        {loading
          ? "Reading file…"
          : page
            ? `Replace plan for ${levelNameFor(activeLevelIndex)}`
            : `Upload a plan for ${levelNameFor(activeLevelIndex)}`}
        <span className="mt-1 block text-xs text-neutral-400">
          PDF, PNG or JPEG · one drawing per storey
        </span>
      </label>

      {pages && (
        <div className="mt-3 space-y-2 rounded border border-neutral-200 p-2">
          <p className="text-xs text-neutral-600">
            {pages.length} pages found. Assign the ones you need:
          </p>
          {pages.map((p) => (
            <div key={p.pdfPage} className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.dataUrl}
                alt={`Page ${p.pdfPage}`}
                className="h-12 w-12 rounded border border-neutral-200 object-cover"
              />
              <span className="text-xs">Page {p.pdfPage}</span>
              <select
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value === "") return;
                  setPlanImage(Number(e.target.value), p);
                }}
                className="ml-auto rounded border border-neutral-300 px-2 py-1 text-xs"
              >
                <option value="">Assign to…</option>
                {LEVEL_CHOICES.map((index) => (
                  <option key={index} value={index}>
                    {levelNameFor(index)}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {page && (
        <>
          <textarea
            value={hints}
            onChange={(e) => setHints(e.target.value)}
            rows={2}
            placeholder="Optional notes for the extractor, e.g. 'the garage is on the left, ignore the site plan inset'"
            className="mt-3 w-full rounded border border-neutral-300 px-2 py-1.5 text-xs outline-none focus:border-neutral-500"
          />
          <button
            onClick={() => void runExtraction(activeLevelIndex, hints)}
            disabled={busy !== null}
            className="mt-2 w-full rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {busy ? busy : extraction ? "Re-read plan with Claude" : "Read plan with Claude"}
          </button>
          {extraction && (
            <p className="mt-2 text-xs text-neutral-500">
              Read {extraction.walls.length} walls, {extraction.openings.length}{" "}
              openings, {extraction.rooms.length} rooms,{" "}
              {extraction.printedDimensions.length} printed dimensions.
              {extraction.drawingScaleLabel &&
                ` Scale printed on drawing: ${extraction.drawingScaleLabel}.`}{" "}
              Nothing becomes geometry until you calibrate.
            </p>
          )}
        </>
      )}
    </section>
  );
}
