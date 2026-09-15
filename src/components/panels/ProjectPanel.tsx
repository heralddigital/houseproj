"use client";

import { useState } from "react";
import { useActiveLevel, useProjectStore } from "@/state/projectStore";
import type { Site } from "@/lib/model/schema";

const inputClass =
  "mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-500";

export function ProjectPanel() {
  const site = useProjectStore((s) => s.site);
  const setSite = useProjectStore((s) => s.setSite);
  const setLevelHeights = useProjectStore((s) => s.setLevelHeights);
  const versions = useProjectStore((s) => s.versions);
  const currentVersion = useProjectStore((s) => s.currentVersion);
  const loadVersion = useProjectStore((s) => s.loadVersion);
  const level = useActiveLevel();
  const [open, setOpen] = useState(false);

  function setConstraint(key: keyof Site["constraints"], value: boolean) {
    setSite({ ...site, constraints: { ...site.constraints, [key]: value } });
  }

  return (
    <section className="p-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-neutral-500"
      >
        <span>5 · Level, site and versions</span>
        <span>{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          {level && (
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-neutral-700">
                {level.name}
              </p>
              <label className="block text-xs text-neutral-600">
                Floor to ceiling (mm)
                <input
                  type="number"
                  value={level.floorToCeilingMm}
                  step={10}
                  min={1000}
                  onChange={(e) =>
                    setLevelHeights(level.index, {
                      floorToCeilingMm: Number(e.target.value),
                    })
                  }
                  className={inputClass}
                />
              </label>
              <label className="block text-xs text-neutral-600">
                Floor build-up / slab thickness (mm)
                <input
                  type="number"
                  value={level.slabThicknessMm}
                  step={10}
                  min={50}
                  onChange={(e) =>
                    setLevelHeights(level.index, {
                      slabThicknessMm: Number(e.target.value),
                    })
                  }
                  className={inputClass}
                />
              </label>
              <p className="text-[11px] text-neutral-400">
                Measure these. Every stair, headroom and storey-height check
                downstream is built on them, and a plan view cannot show them.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-[11px] font-medium text-neutral-700">Site</p>
            <label className="block text-xs text-neutral-600">
              Property type
              <select
                value={site.propertyType}
                onChange={(e) =>
                  setSite({
                    ...site,
                    propertyType: e.target.value as Site["propertyType"],
                  })
                }
                className={inputClass}
              >
                <option value="detached">Detached</option>
                <option value="semi-detached">Semi-detached</option>
                <option value="terraced">Terraced</option>
              </select>
            </label>
            {(
              [
                ["conservationArea", "In a conservation area"],
                ["listed", "Listed building"],
                ["article4", "Article 4 direction applies"],
                ["flat", "Flat or maisonette"],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-2 text-xs text-neutral-600"
              >
                <input
                  type="checkbox"
                  checked={site.constraints[key] ?? false}
                  onChange={(e) => setConstraint(key, e.target.checked)}
                />
                {label}
              </label>
            ))}
            <p className="text-[11px] text-neutral-400">
              Used by the Phase 5 rules engine. Any of the last three can remove
              permitted development rights entirely — check them on the Planning
              Portal and with your local planning authority rather than assuming.
            </p>
          </div>

          <div>
            <p className="text-[11px] font-medium text-neutral-700">
              Versions ({versions.length})
            </p>
            <ul className="mt-1 max-h-48 space-y-1 overflow-auto">
              {[...versions].reverse().map((version) => (
                <li key={version.version}>
                  <button
                    onClick={() => void loadVersion(version.version)}
                    className={`w-full rounded px-2 py-1 text-left text-[11px] ${
                      version.version === currentVersion
                        ? "bg-neutral-900 text-white"
                        : "bg-neutral-50 text-neutral-700 hover:bg-neutral-100"
                    }`}
                  >
                    v{version.version} · {version.label}
                    <span className="block opacity-70">
                      {version.source} ·{" "}
                      {new Date(version.createdAt).toLocaleString("en-GB")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
