import type { ProjectRecord, ProjectStore, VersionRecord } from "@/lib/storage/types";

/**
 * Browser-local persistence. Chosen deliberately as the default: a single-user
 * design tool should work with zero backend setup, and plan images (several MB
 * of data URL each) are far past what localStorage will hold.
 *
 * Everything here is per-browser. Supabase is the sync story, not this.
 */

const DB_NAME = "houseproj";
const DB_VERSION = 1;
const PROJECTS = "projects";
const VERSIONS = "versions";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECTS)) {
        db.createObjectStore(PROJECTS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(VERSIONS)) {
        const store = db.createObjectStore(VERSIONS, {
          keyPath: ["projectId", "version"],
        });
        store.createIndex("byProject", "projectId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open the local database."));
  });
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB error"));
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    const tx = db.transaction(storeName, mode);
    const result = await promisify(fn(tx.objectStore(storeName)));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    });
    return result;
  } finally {
    db.close();
  }
}

export class IndexedDbStore implements ProjectStore {
  readonly kind = "indexeddb" as const;

  async listProjects(): Promise<ProjectRecord[]> {
    const all = await withStore<ProjectRecord[]>(PROJECTS, "readonly", (s) =>
      s.getAll() as IDBRequest<ProjectRecord[]>,
    );
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getProject(id: string): Promise<ProjectRecord | null> {
    const record = await withStore<ProjectRecord | undefined>(
      PROJECTS,
      "readonly",
      (s) => s.get(id) as IDBRequest<ProjectRecord | undefined>,
    );
    return record ?? null;
  }

  async saveProject(project: ProjectRecord): Promise<void> {
    await withStore(PROJECTS, "readwrite", (s) => s.put(project));
  }

  async deleteProject(id: string): Promise<void> {
    await withStore(PROJECTS, "readwrite", (s) => s.delete(id));
    const versions = await this.listVersions(id);
    for (const v of versions) {
      await withStore(VERSIONS, "readwrite", (s) => s.delete([id, v.version]));
    }
  }

  async listVersions(projectId: string): Promise<VersionRecord[]> {
    const all = await withStore<VersionRecord[]>(VERSIONS, "readonly", (s) =>
      s.index("byProject").getAll(projectId) as IDBRequest<VersionRecord[]>,
    );
    return all.sort((a, b) => a.version - b.version);
  }

  async getVersion(
    projectId: string,
    version: number,
  ): Promise<VersionRecord | null> {
    const record = await withStore<VersionRecord | undefined>(
      VERSIONS,
      "readonly",
      (s) => s.get([projectId, version]) as IDBRequest<VersionRecord | undefined>,
    );
    return record ?? null;
  }

  async saveVersion(record: VersionRecord): Promise<void> {
    await withStore(VERSIONS, "readwrite", (s) => s.put(record));
  }

  async putPlanImage(
    _projectId: string,
    _levelIndex: number,
    dataUrl: string,
  ): Promise<string> {
    // The data URL is stored inline on the project record, which IndexedDB
    // handles fine. Nothing to upload.
    return dataUrl;
  }
}
