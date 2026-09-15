"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Point } from "@/lib/model/schema";
import { useProjectStore, type EditorTool } from "@/state/projectStore";
import { levelNameFor } from "@/lib/model/factory";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { PlanCanvas } from "@/components/PlanCanvas";
import { ImportPanel } from "@/components/panels/ImportPanel";
import { CalibrationPanel } from "@/components/panels/CalibrationPanel";
import { InspectorPanel } from "@/components/panels/InspectorPanel";
import { IssuesPanel } from "@/components/panels/IssuesPanel";
import { ProjectPanel } from "@/components/panels/ProjectPanel";

const TOOLS: { id: EditorTool; label: string; hint: string }[] = [
  { id: "select", label: "Select", hint: "Select and drag wall endpoints" },
  { id: "draw-wall", label: "Wall", hint: "Click a start point, then an end point" },
  { id: "add-door", label: "Door", hint: "Click on a wall to add a door" },
  { id: "add-window", label: "Window", hint: "Click on a wall to add a window" },
];

const LEVEL_CHOICES = [0, 1, 2];

export function Workspace({ projectId }: { projectId: string }) {
  const openProject = useProjectStore((s) => s.openProject);
  const projectName = useProjectStore((s) => s.projectName);
  const loadedProjectId = useProjectStore((s) => s.projectId);
  const levels = useProjectStore((s) => s.model.levels);
  const activeLevelIndex = useProjectStore((s) => s.activeLevelIndex);
  const setActiveLevel = useProjectStore((s) => s.setActiveLevel);
  const addLevel = useProjectStore((s) => s.addLevel);
  const tool = useProjectStore((s) => s.tool);
  const setTool = useProjectStore((s) => s.setTool);
  const dirty = useProjectStore((s) => s.dirty);
  const currentVersion = useProjectStore((s) => s.currentVersion);
  const saveVersion = useProjectStore((s) => s.saveVersion);
  const error = useProjectStore((s) => s.error);
  const setError = useProjectStore((s) => s.setError);

  const [mode, setMode] = useState<"edit" | "calibrate">("edit");
  const [calibrationPoints, setCalibrationPoints] = useState<Point[]>([]);

  useEffect(() => {
    void openProject(projectId);
  }, [projectId, openProject]);

  function onCalibrationPick(point: Point) {
    setCalibrationPoints((points) =>
      points.length >= 2 ? [point] : [...points, point],
    );
  }

  const activeLevelExists = levels.some((l) => l.index === activeLevelIndex);

  return (
    <div className="flex h-screen flex-col">
      <DisclaimerBanner />

      <header className="flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-2">
        <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-900">
          ←
        </Link>
        <h1 className="text-sm font-semibold">{projectName}</h1>
        <span className="rounded bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">
          v{currentVersion}
          {dirty ? " · unsaved changes" : ""}
        </span>

        <div className="ml-4 flex items-center gap-1">
          {levels.map((level) => (
            <button
              key={level.index}
              onClick={() => setActiveLevel(level.index)}
              className={`rounded px-2.5 py-1 text-xs ${
                level.index === activeLevelIndex
                  ? "bg-neutral-900 text-white"
                  : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
              }`}
            >
              {level.name}
            </button>
          ))}
          <select
            value=""
            onChange={(e) => {
              if (e.target.value === "") return;
              addLevel(Number(e.target.value));
              e.currentTarget.value = "";
            }}
            className="rounded border border-neutral-300 px-2 py-1 text-xs"
          >
            <option value="">+ level</option>
            {LEVEL_CHOICES.filter(
              (index) => !levels.some((l) => l.index === index),
            ).map((index) => (
              <option key={index} value={index}>
                {levelNameFor(index)}
              </option>
            ))}
          </select>
        </div>

        <div className="ml-auto flex items-center gap-1">
          {TOOLS.map((item) => (
            <button
              key={item.id}
              title={item.hint}
              disabled={mode === "calibrate"}
              onClick={() => setTool(item.id)}
              className={`rounded px-2.5 py-1 text-xs disabled:opacity-40 ${
                tool === item.id && mode === "edit"
                  ? "bg-blue-600 text-white"
                  : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
              }`}
            >
              {item.label}
            </button>
          ))}
          <button
            onClick={() =>
              void saveVersion(
                `Edits on ${levelNameFor(activeLevelIndex)}`,
                "manual-edit",
              )
            }
            disabled={!dirty}
            className="ml-2 rounded bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
          >
            Save version
          </button>
        </div>
      </header>

      {error && (
        <div className="flex items-start gap-3 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="font-medium">
            Dismiss
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1">
          {loadedProjectId === null ? (
            <div className="flex h-full items-center justify-center text-sm text-neutral-500">
              Loading project…
            </div>
          ) : (
            <PlanCanvas
              mode={mode}
              calibrationPoints={calibrationPoints}
              onCalibrationPick={onCalibrationPick}
            />
          )}
        </main>

        <aside className="w-96 shrink-0 overflow-y-auto border-l border-neutral-200 bg-white">
          <ImportPanel />
          <CalibrationPanel
            mode={mode}
            setMode={setMode}
            points={calibrationPoints}
            setPoints={setCalibrationPoints}
          />
          <InspectorPanel />
          <IssuesPanel />
          <ProjectPanel />
          {!activeLevelExists && (
            <p className="p-4 text-xs text-neutral-500">
              This level has no geometry yet.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
