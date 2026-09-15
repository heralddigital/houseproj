"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { v4 as uuid } from "uuid";
import { getStore, type ProjectRecord } from "@/lib/storage";
import { emptyModel, DEFAULT_SITE } from "@/lib/model/factory";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";

export default function HomePage() {
  const [projects, setProjects] = useState<ProjectRecord[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [storeKind, setStoreKind] = useState<string>("");

  useEffect(() => {
    const store = getStore();
    setStoreKind(store.kind);
    store
      .listProjects()
      .then(setProjects)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Could not list projects."),
      );
  }, []);

  async function createProject() {
    const projectName = name.trim() || "My house";
    try {
      const store = getStore();
      const id = uuid();
      const now = new Date().toISOString();
      await store.saveProject({
        id,
        name: projectName,
        createdAt: now,
        updatedAt: now,
        site: DEFAULT_SITE,
        planImages: [],
        calibrations: [],
        currentVersion: 0,
      });
      await store.saveVersion({
        projectId: id,
        version: 0,
        label: "Empty project",
        source: "import",
        createdAt: now,
        model: emptyModel(projectName),
      });
      window.location.href = `/project/${id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the project.");
    }
  }

  return (
    <main className="min-h-screen">
      <DisclaimerBanner />
      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">houseproj</h1>
        <p className="mt-2 max-w-prose text-sm text-neutral-600">
          Import a floor plan per storey, calibrate it against a known
          dimension, and edit the result as a structured model in millimetres.
          Phase 1 covers import, calibration and the 2D editor.
        </p>

        <section className="mt-8 rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-semibold">New project</h2>
          <div className="mt-3 flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void createProject();
              }}
              placeholder="e.g. 14 Example Road"
              className="w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
            />
            <button
              onClick={() => void createProject()}
              className="shrink-0 rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
            >
              Create
            </button>
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            Storage: {storeKind === "supabase" ? "Supabase" : "this browser (IndexedDB)"}
            {storeKind === "indexeddb" &&
              " — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to sync instead."}
          </p>
        </section>

        {error && (
          <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        <section className="mt-8">
          <h2 className="text-sm font-semibold">Projects</h2>
          {projects === null ? (
            <p className="mt-3 text-sm text-neutral-500">Loading…</p>
          ) : projects.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">
              Nothing yet. Create a project above, then upload a floor plan.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
              {projects.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/project/${project.id}`}
                    className="flex items-center justify-between px-4 py-3 text-sm hover:bg-neutral-50"
                  >
                    <span className="font-medium">{project.name}</span>
                    <span className="text-xs text-neutral-500">
                      v{project.currentVersion} ·{" "}
                      {new Date(project.updatedAt).toLocaleDateString("en-GB")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
