"use client";

import { create } from "zustand";
import { v4 as uuid } from "uuid";
import type {
  Calibration,
  HouseModel,
  Level,
  Opening,
  Point,
  Room,
  RoomUse,
  Site,
  Wall,
} from "@/lib/model/schema";
import { emptyLevel, emptyModel, levelNameFor, withLevel } from "@/lib/model/factory";
import { levelFromExtraction, rescaleLevel, type ImportWarning } from "@/lib/model/fromExtraction";
import type { PlanExtraction } from "@/lib/ai/extractionSchema";
import {
  buildCalibration,
  checkPrintedDimensions,
  suggestedMmPerPixel,
  type DimensionCheck,
  type PrintedDimension,
} from "@/lib/calibration/calibration";
import { getStore, type ProjectRecord, type VersionRecord } from "@/lib/storage";
import type { LoadedPlanPage } from "@/lib/plan/loadPlan";
import { DEFAULT_SITE } from "@/lib/model/factory";

export type EditorTool = "select" | "draw-wall" | "add-door" | "add-window";

export type Selection =
  | { kind: "wall"; id: string }
  | { kind: "opening"; id: string }
  | { kind: "room"; id: string }
  | null;

type ByLevel<T> = Record<number, T>;

type State = {
  projectId: string | null;
  projectName: string;
  site: Site;
  model: HouseModel;
  versions: VersionRecord[];
  currentVersion: number;
  dirty: boolean;

  activeLevelIndex: number;
  planImages: ByLevel<LoadedPlanPage>;
  calibrations: ByLevel<Calibration>;
  extractions: ByLevel<PlanExtraction>;
  importWarnings: ByLevel<ImportWarning[]>;
  dimensionChecks: ByLevel<DimensionCheck[]>;

  tool: EditorTool;
  selection: Selection;
  busy: string | null;
  error: string | null;
};

type Actions = {
  createProject: (name: string) => Promise<void>;
  openProject: (projectId: string) => Promise<void>;
  persist: () => Promise<void>;
  saveVersion: (label: string, source: VersionRecord["source"]) => Promise<void>;
  loadVersion: (version: number) => Promise<void>;

  setActiveLevel: (index: number) => void;
  addLevel: (index: number) => void;
  setLevelHeights: (
    index: number,
    values: { floorToCeilingMm?: number; slabThicknessMm?: number },
  ) => void;
  setSite: (site: Site) => void;

  setPlanImage: (levelIndex: number, page: LoadedPlanPage) => void;
  runExtraction: (levelIndex: number, hints: string) => Promise<void>;
  applyCalibration: (params: {
    levelIndex: number;
    pointA: Point;
    pointB: Point;
    realDistanceMm: number;
  }) => void;
  acceptSuggestedScale: (levelIndex: number) => void;

  addWall: (wall: Omit<Wall, "id">) => string;
  updateWall: (id: string, patch: Partial<Omit<Wall, "id">>) => void;
  deleteWall: (id: string) => void;
  addOpening: (opening: Omit<Opening, "id">) => string;
  updateOpening: (id: string, patch: Partial<Omit<Opening, "id">>) => void;
  deleteOpening: (id: string) => void;
  addRoom: (room: Omit<Room, "id">) => string;
  updateRoom: (id: string, patch: { name?: string; use?: RoomUse }) => void;
  deleteRoom: (id: string) => void;

  setTool: (tool: EditorTool) => void;
  select: (selection: Selection) => void;
  setError: (error: string | null) => void;
};

const initialModel = emptyModel("Untitled house");

const initialState: State = {
  projectId: null,
  projectName: initialModel.meta.name,
  site: DEFAULT_SITE,
  model: initialModel,
  versions: [],
  currentVersion: 0,
  dirty: false,
  activeLevelIndex: 0,
  planImages: {},
  calibrations: {},
  extractions: {},
  importWarnings: {},
  dimensionChecks: {},
  tool: "select",
  selection: null,
  busy: null,
  error: null,
};

/** Apply a change to the active level and mark the working model dirty. */
function editActiveLevel(
  state: State,
  fn: (level: Level) => Level,
): Pick<State, "model" | "dirty"> {
  const level = state.model.levels.find((l) => l.index === state.activeLevelIndex);
  if (!level) return { model: state.model, dirty: state.dirty };
  return { model: withLevel(state.model, fn(level)), dirty: true };
}

export const useProjectStore = create<State & Actions>((set, get) => ({
  ...initialState,

  async createProject(name) {
    const model = emptyModel(name);
    const projectId = uuid();
    const now = new Date().toISOString();
    const record: ProjectRecord = {
      id: projectId,
      name,
      createdAt: now,
      updatedAt: now,
      site: DEFAULT_SITE,
      planImages: [],
      calibrations: [],
      currentVersion: 0,
    };
    await getStore().saveProject(record);
    await getStore().saveVersion({
      projectId,
      version: 0,
      label: "Empty project",
      source: "import",
      createdAt: now,
      model,
    });
    set({
      ...initialState,
      projectId,
      projectName: name,
      model,
      versions: [
        {
          projectId,
          version: 0,
          label: "Empty project",
          source: "import",
          createdAt: now,
          model,
        },
      ],
    });
  },

  async openProject(projectId) {
    set({ busy: "Opening project…", error: null });
    try {
      const store = getStore();
      const record = await store.getProject(projectId);
      if (!record) throw new Error("That project no longer exists.");
      const versions = await store.listVersions(projectId);
      const current =
        versions.find((v) => v.version === record.currentVersion) ??
        versions[versions.length - 1];
      if (!current) throw new Error("That project has no saved versions.");

      const planImages: ByLevel<LoadedPlanPage> = {};
      for (const image of record.planImages) {
        planImages[image.levelIndex] = {
          dataUrl: image.url,
          widthPx: image.widthPx,
          heightPx: image.heightPx,
          sourceFilename: image.sourceFilename,
          pdfPage: image.pdfPage,
        };
      }
      const calibrations: ByLevel<Calibration> = {};
      for (const calibration of record.calibrations) {
        calibrations[calibration.levelIndex] = calibration;
      }

      set({
        ...initialState,
        projectId,
        projectName: record.name,
        site: record.site,
        model: current.model,
        versions,
        currentVersion: current.version,
        planImages,
        calibrations,
        activeLevelIndex: current.model.levels[0]?.index ?? 0,
        busy: null,
      });
    } catch (error) {
      set({
        busy: null,
        error: error instanceof Error ? error.message : "Could not open project.",
      });
    }
  },

  async persist() {
    const state = get();
    if (!state.projectId) return;
    const record: ProjectRecord = {
      id: state.projectId,
      name: state.projectName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      site: state.site,
      planImages: Object.entries(state.planImages).map(([index, page]) => ({
        levelIndex: Number(index),
        url: page.dataUrl,
        widthPx: page.widthPx,
        heightPx: page.heightPx,
        sourceFilename: page.sourceFilename,
        pdfPage: page.pdfPage,
      })),
      calibrations: Object.values(state.calibrations),
      currentVersion: state.currentVersion,
    };
    await getStore().saveProject(record);
  },

  async saveVersion(label, source) {
    const state = get();
    if (!state.projectId) {
      set({ error: "Create or open a project before saving a version." });
      return;
    }
    // Versions are immutable and append-only: a new number every time, with
    // the version it came from recorded. Nothing is ever overwritten.
    const nextVersion =
      state.versions.reduce((max, v) => Math.max(max, v.version), 0) + 1;
    const model: HouseModel = {
      ...state.model,
      meta: {
        ...state.model.meta,
        name: state.projectName,
        version: nextVersion,
        parentVersion: state.currentVersion,
      },
      site: state.site,
    };
    const record: VersionRecord = {
      projectId: state.projectId,
      version: nextVersion,
      parentVersion: state.currentVersion,
      label,
      source,
      createdAt: new Date().toISOString(),
      model,
    };
    await getStore().saveVersion(record);
    set({
      model,
      versions: [...state.versions, record],
      currentVersion: nextVersion,
      dirty: false,
    });
    await get().persist();
  },

  async loadVersion(version) {
    const state = get();
    if (!state.projectId) return;
    const record = await getStore().getVersion(state.projectId, version);
    if (!record) {
      set({ error: `Version ${version} was not found.` });
      return;
    }
    set({
      model: record.model,
      currentVersion: version,
      site: record.model.site ?? state.site,
      dirty: false,
      selection: null,
    });
    await get().persist();
  },

  setActiveLevel(index) {
    set({ activeLevelIndex: index, selection: null });
  },

  addLevel(index) {
    const state = get();
    if (state.model.levels.some((l) => l.index === index)) {
      set({ activeLevelIndex: index });
      return;
    }
    set({
      model: withLevel(state.model, emptyLevel(index, levelNameFor(index))),
      activeLevelIndex: index,
      dirty: true,
    });
  },

  setLevelHeights(index, values) {
    const state = get();
    const level = state.model.levels.find((l) => l.index === index);
    if (!level) return;
    set({
      model: withLevel(state.model, {
        ...level,
        floorToCeilingMm: values.floorToCeilingMm ?? level.floorToCeilingMm,
        slabThicknessMm: values.slabThicknessMm ?? level.slabThicknessMm,
      }),
      dirty: true,
    });
  },

  setSite(site) {
    set({ site, dirty: true });
  },

  setPlanImage(levelIndex, page) {
    const state = get();
    set({
      planImages: { ...state.planImages, [levelIndex]: page },
      // A new drawing invalidates the old scale and the old reading of it.
      calibrations: Object.fromEntries(
        Object.entries(state.calibrations).filter(
          ([index]) => Number(index) !== levelIndex,
        ),
      ),
      extractions: Object.fromEntries(
        Object.entries(state.extractions).filter(
          ([index]) => Number(index) !== levelIndex,
        ),
      ),
      activeLevelIndex: levelIndex,
      dirty: true,
    });
    if (!state.model.levels.some((l) => l.index === levelIndex)) {
      get().addLevel(levelIndex);
    }
    void get().persist();
  },

  async runExtraction(levelIndex, hints) {
    const state = get();
    const page = state.planImages[levelIndex];
    if (!page) {
      set({ error: "Upload a plan for this level first." });
      return;
    }
    set({ busy: "Reading the plan with Claude…", error: null });
    try {
      const response = await fetch("/api/extract-plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: page.dataUrl,
          levelIndex,
          levelLabel: levelNameFor(levelIndex),
          hints,
        }),
      });
      const result = await response.json();
      if (!result.ok) {
        set({ busy: null, error: result.error ?? "Extraction failed." });
        return;
      }
      set((s) => ({
        extractions: { ...s.extractions, [levelIndex]: result.extraction },
        busy: null,
      }));
      // If this level is already calibrated, turn the extraction into geometry
      // straight away; otherwise calibration will do it.
      const calibration = get().calibrations[levelIndex];
      if (calibration) {
        get().applyCalibration({
          levelIndex,
          pointA: calibration.pointA,
          pointB: calibration.pointB,
          realDistanceMm: calibration.realDistanceMm,
        });
      }
    } catch (error) {
      set({
        busy: null,
        error:
          error instanceof Error ? error.message : "Could not reach the extractor.",
      });
    }
  },

  applyCalibration({ levelIndex, pointA, pointB, realDistanceMm }) {
    const state = get();
    try {
      const calibration = buildCalibration({
        levelIndex,
        pointA,
        pointB,
        realDistanceMm,
        // Model origin is the image's top-left, so plan pixels and model
        // millimetres share an origin and overlays line up with no offset.
        originPx: { x: 0, y: 0 },
      });

      const extraction = state.extractions[levelIndex];
      let model = state.model;
      let warnings: ImportWarning[] = [];
      let checks: DimensionCheck[] = [];

      if (extraction) {
        const existing = state.model.levels.find((l) => l.index === levelIndex);
        const imported = levelFromExtraction({
          extraction,
          calibration,
          levelIndex,
          levelName: extraction.levelName || levelNameFor(levelIndex),
          floorToCeilingMm: existing?.floorToCeilingMm,
          slabThicknessMm: existing?.slabThicknessMm,
        });
        model = withLevel(state.model, imported.level);
        warnings = imported.warnings;

        const printed: PrintedDimension[] = extraction.printedDimensions.map(
          (d) => ({
            label: d.label,
            valueMm: d.valueMm,
            fromPx: d.fromPx,
            toPx: d.toPx,
          }),
        );
        checks = checkPrintedDimensions(printed, calibration);
      }

      set({
        calibrations: { ...state.calibrations, [levelIndex]: calibration },
        model,
        importWarnings: { ...state.importWarnings, [levelIndex]: warnings },
        dimensionChecks: { ...state.dimensionChecks, [levelIndex]: checks },
        dirty: true,
        error: null,
      });
      void get().persist();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Calibration failed.",
      });
    }
  },

  acceptSuggestedScale(levelIndex) {
    const state = get();
    const extraction = state.extractions[levelIndex];
    const calibration = state.calibrations[levelIndex];
    const level = state.model.levels.find((l) => l.index === levelIndex);
    if (!extraction || !calibration || !level) return;

    const suggested = suggestedMmPerPixel(
      extraction.printedDimensions.map((d) => ({
        label: d.label,
        valueMm: d.valueMm,
        fromPx: d.fromPx,
        toPx: d.toPx,
      })),
    );
    if (!suggested) {
      set({ error: "No printed dimensions were found to derive a scale from." });
      return;
    }

    const factor = suggested / calibration.mmPerPixel;
    const next: Calibration = {
      ...calibration,
      mmPerPixel: suggested,
      calibratedAt: new Date().toISOString(),
    };
    set({
      model: withLevel(state.model, rescaleLevel(level, factor)),
      calibrations: { ...state.calibrations, [levelIndex]: next },
      dimensionChecks: {
        ...state.dimensionChecks,
        [levelIndex]: checkPrintedDimensions(
          extraction.printedDimensions.map((d) => ({
            label: d.label,
            valueMm: d.valueMm,
            fromPx: d.fromPx,
            toPx: d.toPx,
          })),
          next,
        ),
      },
      dirty: true,
    });
    void get().persist();
  },

  addWall(wall) {
    const id = `w-${uuid().slice(0, 8)}`;
    set((state) =>
      editActiveLevel(state, (level) => ({
        ...level,
        walls: [...level.walls, { ...wall, id }],
      })),
    );
    return id;
  },

  updateWall(id, patch) {
    set((state) =>
      editActiveLevel(state, (level) => ({
        ...level,
        walls: level.walls.map((w) => (w.id === id ? { ...w, ...patch } : w)),
      })),
    );
  },

  deleteWall(id) {
    set((state) => ({
      ...editActiveLevel(state, (level) => ({
        ...level,
        walls: level.walls.filter((w) => w.id !== id),
        // Openings cannot outlive their wall.
        openings: level.openings.filter((o) => o.wallId !== id),
      })),
      selection: null,
    }));
  },

  addOpening(opening) {
    const id = `o-${uuid().slice(0, 8)}`;
    set((state) =>
      editActiveLevel(state, (level) => ({
        ...level,
        openings: [...level.openings, { ...opening, id }],
      })),
    );
    return id;
  },

  updateOpening(id, patch) {
    set((state) =>
      editActiveLevel(state, (level) => ({
        ...level,
        openings: level.openings.map((o) =>
          o.id === id ? { ...o, ...patch } : o,
        ),
      })),
    );
  },

  deleteOpening(id) {
    set((state) => ({
      ...editActiveLevel(state, (level) => ({
        ...level,
        openings: level.openings.filter((o) => o.id !== id),
      })),
      selection: null,
    }));
  },

  addRoom(room) {
    const id = `r-${uuid().slice(0, 8)}`;
    set((state) =>
      editActiveLevel(state, (level) => ({
        ...level,
        rooms: [...level.rooms, { ...room, id }],
      })),
    );
    return id;
  },

  updateRoom(id, patch) {
    set((state) =>
      editActiveLevel(state, (level) => ({
        ...level,
        rooms: level.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      })),
    );
  },

  deleteRoom(id) {
    set((state) => ({
      ...editActiveLevel(state, (level) => ({
        ...level,
        rooms: level.rooms.filter((r) => r.id !== id),
      })),
      selection: null,
    }));
  },

  setTool(tool) {
    set({ tool, selection: null });
  },

  select(selection) {
    set({ selection });
  },

  setError(error) {
    set({ error });
  },
}));

/** The level currently being edited, or undefined before any import. */
export function useActiveLevel(): Level | undefined {
  return useProjectStore((s) =>
    s.model.levels.find((l) => l.index === s.activeLevelIndex),
  );
}
