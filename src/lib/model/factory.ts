import type { HouseModel, Level, Material, Site } from "@/lib/model/schema";
import { IMPORT_DEFAULTS } from "@/lib/model/importDefaults";

export const DEFAULT_SITE: Site = {
  // Confirmed by the owner at project start; change it in the site panel.
  propertyType: "semi-detached",
  constraints: {
    conservationArea: false,
    listed: false,
    article4: false,
    flat: false,
  },
};

/**
 * Two neutral finishes so nothing renders untextured before Phase 3.
 * Both are plain labels — no manufacturer colour is claimed.
 */
export const DEFAULT_MATERIALS: Material[] = [
  {
    id: "mat-default-wall",
    name: "Default wall",
    kind: "paint",
    hex: "#f2efe9",
    roughness: 0.9,
  },
  {
    id: "mat-default-floor",
    name: "Default floor",
    kind: "floor",
    hex: "#b9a68d",
    roughness: 0.8,
  },
];

export function emptyLevel(index: number, name: string): Level {
  return {
    index,
    name,
    floorToCeilingMm: IMPORT_DEFAULTS.floorToCeilingMm,
    slabThicknessMm: IMPORT_DEFAULTS.slabThicknessMm,
    walls: [],
    openings: [],
    rooms: [],
    stairs: [],
  };
}

export function emptyModel(name: string): HouseModel {
  return {
    meta: { name, country: "England", version: 0 },
    site: DEFAULT_SITE,
    levels: [emptyLevel(0, "Ground floor")],
    materials: [...DEFAULT_MATERIALS],
  };
}

export const LEVEL_NAME_BY_INDEX: Record<number, string> = {
  [-1]: "Basement",
  0: "Ground floor",
  1: "First floor",
  2: "Second floor",
  3: "Third floor",
};

export function levelNameFor(index: number): string {
  return LEVEL_NAME_BY_INDEX[index] ?? `Level ${index}`;
}

/** Replace a level in place, or append it if the index is new. */
export function withLevel(model: HouseModel, level: Level): HouseModel {
  const exists = model.levels.some((l) => l.index === level.index);
  const levels = exists
    ? model.levels.map((l) => (l.index === level.index ? level : l))
    : [...model.levels, level];
  levels.sort((a, b) => a.index - b.index);
  return { ...model, levels };
}
