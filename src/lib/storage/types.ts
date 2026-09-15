import type {
  Calibration,
  HouseModel,
  PlanImage,
  Site,
} from "@/lib/model/schema";

export type ProjectRecord = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  site: Site;
  planImages: PlanImage[];
  calibrations: Calibration[];
  /** Version number of the model currently open in the editor. */
  currentVersion: number;
};

export type VersionSource = "import" | "manual-edit" | "ai-edit" | "recalibrate";

export type VersionRecord = {
  projectId: string;
  version: number;
  parentVersion?: number;
  label: string;
  source: VersionSource;
  createdAt: string;
  model: HouseModel;
};

/**
 * Persistence contract. Two implementations exist: IndexedDB in the browser
 * (the default, zero setup) and Supabase (used automatically when its env vars
 * are present). Nothing above this interface knows which one is active.
 */
export interface ProjectStore {
  readonly kind: "indexeddb" | "supabase";
  listProjects(): Promise<ProjectRecord[]>;
  getProject(id: string): Promise<ProjectRecord | null>;
  saveProject(project: ProjectRecord): Promise<void>;
  deleteProject(id: string): Promise<void>;
  listVersions(projectId: string): Promise<VersionRecord[]>;
  getVersion(projectId: string, version: number): Promise<VersionRecord | null>;
  saveVersion(record: VersionRecord): Promise<void>;
  /**
   * Store a plan image and return the URL to reference it by. The IndexedDB
   * store keeps the data URL as-is; Supabase uploads it and returns a public
   * URL.
   */
  putPlanImage(
    projectId: string,
    levelIndex: number,
    dataUrl: string,
  ): Promise<string>;
}
