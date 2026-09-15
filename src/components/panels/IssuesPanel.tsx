"use client";

import { useState } from "react";
import { useActiveLevel, useProjectStore } from "@/state/projectStore";
import type { ImportWarning } from "@/lib/model/fromExtraction";

const GROUP_LABEL: Record<ImportWarning["code"], string> = {
  "assumed-opening-height": "Assumed opening heights",
  "assumed-wall-thickness": "Assumed wall thicknesses",
  "assumed-storey-height": "Assumed storey heights",
  "orphan-opening": "Dropped openings",
  "opening-off-wall": "Dropped openings",
  "degenerate-wall": "Dropped walls",
  "open-room": "Dropped rooms",
  "low-confidence": "Low confidence readings",
  "extractor-note": "Notes from the extractor",
};

export function IssuesPanel() {
  const warnings = useProjectStore((s) => s.importWarnings[s.activeLevelIndex]);
  const select = useProjectStore((s) => s.select);
  const level = useActiveLevel();
  const [open, setOpen] = useState(true);

  if (!warnings || warnings.length === 0) return null;

  const groups = new Map<string, ImportWarning[]>();
  for (const warning of warnings) {
    const label = GROUP_LABEL[warning.code];
    groups.set(label, [...(groups.get(label) ?? []), warning]);
  }

  return (
    <section className="border-b border-neutral-200 p-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-neutral-500"
      >
        <span>4 · Import notes ({warnings.length})</span>
        <span>{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          <p className="text-[11px] leading-snug text-neutral-500">
            Everything the drawing could not tell us, and everything that was
            dropped. Work through this list before trusting the model — these
            are the things a plan physically cannot show.
          </p>
          {[...groups.entries()].map(([label, items]) => (
            <div key={label}>
              <p className="text-[11px] font-medium text-neutral-700">
                {label} ({items.length})
              </p>
              <ul className="mt-1 space-y-1">
                {items.map((warning, index) => {
                  const targetsWall = level?.walls.some(
                    (w) => w.id === warning.elementId,
                  );
                  const targetsOpening = level?.openings.some(
                    (o) => o.id === warning.elementId,
                  );
                  const targetsRoom = level?.rooms.some(
                    (r) => r.id === warning.elementId,
                  );
                  const clickable =
                    targetsWall || targetsOpening || targetsRoom;
                  return (
                    <li
                      key={`${warning.code}-${index}`}
                      onClick={() => {
                        if (!warning.elementId) return;
                        if (targetsWall)
                          select({ kind: "wall", id: warning.elementId });
                        else if (targetsOpening)
                          select({ kind: "opening", id: warning.elementId });
                        else if (targetsRoom)
                          select({ kind: "room", id: warning.elementId });
                      }}
                      className={`rounded bg-neutral-50 px-2 py-1 text-[11px] leading-snug text-neutral-700 ${
                        clickable ? "cursor-pointer hover:bg-neutral-100" : ""
                      }`}
                    >
                      {warning.message}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
