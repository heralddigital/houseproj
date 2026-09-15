import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ProjectRecord, ProjectStore, VersionRecord } from "@/lib/storage/types";

/**
 * Supabase-backed persistence. Active only when both public env vars are set;
 * otherwise the app uses IndexedDB and needs no backend at all.
 *
 * NOT YET EXERCISED AGAINST A LIVE SUPABASE PROJECT — see README "Known
 * limitations". The table and bucket definitions it expects are in
 * supabase/schema.sql.
 */

const BUCKET = "plans";

export function supabaseConfig(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

type ProjectRow = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  data: Omit<ProjectRecord, "id" | "name" | "createdAt" | "updatedAt">;
};

type VersionRow = {
  project_id: string;
  version: number;
  parent_version: number | null;
  label: string;
  source: VersionRecord["source"];
  created_at: string;
  model: VersionRecord["model"];
};

function toProject(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...row.data,
  };
}

function toVersion(row: VersionRow): VersionRecord {
  return {
    projectId: row.project_id,
    version: row.version,
    parentVersion: row.parent_version ?? undefined,
    label: row.label,
    source: row.source,
    createdAt: row.created_at,
    model: row.model,
  };
}

export class SupabaseStore implements ProjectStore {
  readonly kind = "supabase" as const;
  private client: SupabaseClient;

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey);
  }

  private unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
    if (result.error) throw new Error(`Supabase: ${result.error.message}`);
    if (result.data === null) throw new Error("Supabase returned no data.");
    return result.data;
  }

  async listProjects(): Promise<ProjectRecord[]> {
    const rows = this.unwrap(
      await this.client
        .from("projects")
        .select("*")
        .order("updated_at", { ascending: false }),
    ) as ProjectRow[];
    return rows.map(toProject);
  }

  async getProject(id: string): Promise<ProjectRecord | null> {
    const { data, error } = await this.client
      .from("projects")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`Supabase: ${error.message}`);
    return data ? toProject(data as ProjectRow) : null;
  }

  async saveProject(project: ProjectRecord): Promise<void> {
    const { id, name, createdAt, updatedAt, ...rest } = project;
    const { error } = await this.client.from("projects").upsert({
      id,
      name,
      created_at: createdAt,
      updated_at: updatedAt,
      data: rest,
    });
    if (error) throw new Error(`Supabase: ${error.message}`);
  }

  async deleteProject(id: string): Promise<void> {
    const { error } = await this.client.from("projects").delete().eq("id", id);
    if (error) throw new Error(`Supabase: ${error.message}`);
  }

  async listVersions(projectId: string): Promise<VersionRecord[]> {
    const rows = this.unwrap(
      await this.client
        .from("model_versions")
        .select("*")
        .eq("project_id", projectId)
        .order("version", { ascending: true }),
    ) as VersionRow[];
    return rows.map(toVersion);
  }

  async getVersion(
    projectId: string,
    version: number,
  ): Promise<VersionRecord | null> {
    const { data, error } = await this.client
      .from("model_versions")
      .select("*")
      .eq("project_id", projectId)
      .eq("version", version)
      .maybeSingle();
    if (error) throw new Error(`Supabase: ${error.message}`);
    return data ? toVersion(data as VersionRow) : null;
  }

  async saveVersion(record: VersionRecord): Promise<void> {
    const { error } = await this.client.from("model_versions").upsert({
      project_id: record.projectId,
      version: record.version,
      parent_version: record.parentVersion ?? null,
      label: record.label,
      source: record.source,
      created_at: record.createdAt,
      model: record.model,
    });
    if (error) throw new Error(`Supabase: ${error.message}`);
  }

  async putPlanImage(
    projectId: string,
    levelIndex: number,
    dataUrl: string,
  ): Promise<string> {
    const match = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
    if (!match) throw new Error("Plan image was not a base64 data URL.");
    const [, mediaType, base64] = match;
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const extension = mediaType.split("/")[1] ?? "png";
    const path = `${projectId}/level-${levelIndex}-${Date.now()}.${extension}`;

    const { error } = await this.client.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: mediaType, upsert: true });
    if (error) throw new Error(`Supabase storage: ${error.message}`);

    const { data } = this.client.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }
}
