"use client";

import { useActiveLevel, useProjectStore } from "@/state/projectStore";
import { formatMm, polygonAreaM2, wallLengthMm } from "@/lib/geometry";
import type { RoomUse } from "@/lib/model/schema";

const ROOM_USES: RoomUse[] = [
  "habitable",
  "kitchen",
  "bathroom",
  "circulation",
  "garage",
  "other",
];

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block text-xs text-neutral-600">
      {label}
      {children}
      {hint && <span className="mt-0.5 block text-[11px] text-neutral-400">{hint}</span>}
    </label>
  );
}

const inputClass =
  "mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-500";

export function InspectorPanel() {
  const selection = useProjectStore((s) => s.selection);
  const updateWall = useProjectStore((s) => s.updateWall);
  const deleteWall = useProjectStore((s) => s.deleteWall);
  const updateOpening = useProjectStore((s) => s.updateOpening);
  const deleteOpening = useProjectStore((s) => s.deleteOpening);
  const updateRoom = useProjectStore((s) => s.updateRoom);
  const deleteRoom = useProjectStore((s) => s.deleteRoom);
  const level = useActiveLevel();

  if (!selection || !level) {
    return (
      <section className="border-b border-neutral-200 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          3 · Inspector
        </h2>
        <p className="mt-2 text-xs text-neutral-500">
          Select a wall, opening or room on the plan to edit it.
        </p>
      </section>
    );
  }

  if (selection.kind === "wall") {
    const wall = level.walls.find((w) => w.id === selection.id);
    if (!wall) return null;
    return (
      <section className="space-y-3 border-b border-neutral-200 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          3 · Wall
        </h2>
        <p className="text-xs text-neutral-500">
          Length {formatMm(wallLengthMm(wall))} · {wall.id}
        </p>

        <Field label="Thickness (mm)">
          <input
            type="number"
            value={wall.thicknessMm}
            min={50}
            step={5}
            onChange={(e) =>
              updateWall(wall.id, { thicknessMm: Number(e.target.value) })
            }
            className={inputClass}
          />
        </Field>

        <Field label="Kind">
          <select
            value={wall.kind}
            onChange={(e) =>
              updateWall(wall.id, { kind: e.target.value as "external" | "internal" })
            }
            className={inputClass}
          >
            <option value="external">External / party</option>
            <option value="internal">Internal</option>
          </select>
        </Field>

        <Field
          label="Structural role"
          hint="A plan cannot show this. Anything left as unknown, or marked load-bearing, will be flagged for a structural engineer in Phase 5."
        >
          <select
            value={wall.structural}
            onChange={(e) =>
              updateWall(wall.id, {
                structural: e.target.value as typeof wall.structural,
              })
            }
            className={inputClass}
          >
            <option value="unknown">Unknown</option>
            <option value="assumed-loadbearing">Assumed load-bearing</option>
            <option value="assumed-non-loadbearing">Assumed non-load-bearing</option>
          </select>
        </Field>

        <Field label="Status">
          <select
            value={wall.status}
            onChange={(e) =>
              updateWall(wall.id, { status: e.target.value as typeof wall.status })
            }
            className={inputClass}
          >
            <option value="existing">Existing</option>
            <option value="proposed">Proposed</option>
            <option value="demolish">Demolish</option>
          </select>
        </Field>

        <button
          onClick={() => deleteWall(wall.id)}
          className="w-full rounded border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50"
        >
          Delete wall and its openings
        </button>
      </section>
    );
  }

  if (selection.kind === "opening") {
    const opening = level.openings.find((o) => o.id === selection.id);
    if (!opening) return null;
    const wall = level.walls.find((w) => w.id === opening.wallId);
    const maxOffset = wall ? Math.max(wallLengthMm(wall) - opening.widthMm, 0) : 0;
    return (
      <section className="space-y-3 border-b border-neutral-200 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          3 · Opening
        </h2>

        <Field label="Type">
          <select
            value={opening.type}
            onChange={(e) =>
              updateOpening(opening.id, {
                type: e.target.value as typeof opening.type,
              })
            }
            className={inputClass}
          >
            <option value="door">Door</option>
            <option value="window">Window</option>
            <option value="rooflight">Rooflight</option>
          </select>
        </Field>

        <Field label="Width (mm)">
          <input
            type="number"
            value={opening.widthMm}
            min={50}
            step={5}
            onChange={(e) =>
              updateOpening(opening.id, { widthMm: Number(e.target.value) })
            }
            className={inputClass}
          />
        </Field>

        <Field
          label="Height (mm)"
          hint="Measured, or still the import assumption? A plan cannot show it."
        >
          <input
            type="number"
            value={opening.heightMm}
            min={50}
            step={5}
            onChange={(e) =>
              updateOpening(opening.id, { heightMm: Number(e.target.value) })
            }
            className={inputClass}
          />
        </Field>

        <Field
          label="Sill height above floor (mm)"
          hint="Part B escape-window checks depend on this. Measure it."
        >
          <input
            type="number"
            value={opening.sillMm ?? 0}
            min={0}
            step={5}
            onChange={(e) =>
              updateOpening(opening.id, { sillMm: Number(e.target.value) })
            }
            className={inputClass}
          />
        </Field>

        <Field label={`Offset along wall (mm, max ${Math.round(maxOffset)})`}>
          <input
            type="number"
            value={opening.offsetMm}
            min={0}
            max={maxOffset}
            step={10}
            onChange={(e) =>
              updateOpening(opening.id, {
                offsetMm: Math.min(Number(e.target.value), maxOffset),
              })
            }
            className={inputClass}
          />
        </Field>

        <label className="flex items-center gap-2 text-xs text-neutral-600">
          <input
            type="checkbox"
            checked={opening.escapeWindow ?? false}
            onChange={(e) =>
              updateOpening(opening.id, { escapeWindow: e.target.checked })
            }
          />
          Intended as an escape window
        </label>

        <button
          onClick={() => deleteOpening(opening.id)}
          className="w-full rounded border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50"
        >
          Delete opening
        </button>
      </section>
    );
  }

  const room = level.rooms.find((r) => r.id === selection.id);
  if (!room) return null;
  return (
    <section className="space-y-3 border-b border-neutral-200 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        3 · Room
      </h2>
      <p className="text-xs text-neutral-500">
        Floor area {polygonAreaM2(room.polygon).toFixed(1)} m² (from the polygon,
        internal face)
      </p>

      <Field label="Name">
        <input
          value={room.name}
          onChange={(e) => updateRoom(room.id, { name: e.target.value })}
          className={inputClass}
        />
      </Field>

      <Field label="Use">
        <select
          value={room.use}
          onChange={(e) => updateRoom(room.id, { use: e.target.value as RoomUse })}
          className={inputClass}
        >
          {ROOM_USES.map((use) => (
            <option key={use} value={use}>
              {use}
            </option>
          ))}
        </select>
      </Field>

      <button
        onClick={() => deleteRoom(room.id)}
        className="w-full rounded border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50"
      >
        Delete room
      </button>
    </section>
  );
}
