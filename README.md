# houseproj

Turn a floor plan into an editable, dimensionally accurate house model, then
(in later phases) into an interactive 3D house, an AI design assistant, a UK
compliance checker, and a render brief for photoreal output.

**Indicative only.** Nothing here is a substitute for planning advice, Building
Control approval, or a structural engineer. Everything is written for England.

Status: **Phase 1 complete** — plan import, calibration, 2D editor.

---

## The one rule

One JSON document per design version is the single source of truth. Every
dimension in it is **millimetres**. Geometry is always derived from that JSON;
nothing edits geometry directly, and later phases (3D, AI edits, rules) all read
from it. The schema lives in `src/lib/model/schema.ts` and is validated with Zod.

Coordinates are plan-view: `x` right, `y` **down** (so plan overlays need no
y-flip), shared origin across levels so storeys stack.

---

## Running it

```bash
npm install
cp .env.example .env.local     # add ANTHROPIC_API_KEY for plan reading
npm run dev                    # http://localhost:3000
```

Other commands:

```bash
npm test          # unit tests (geometry, calibration, import, JSON recovery)
npm run typecheck
npm run build
npm run sample:plan   # regenerate the synthetic test plan in public/sample/
```

Storage needs no setup: projects live in the browser's IndexedDB. Set
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (and apply
`supabase/schema.sql`) to use Supabase instead.

### Try it without your own plan

`public/sample/sample-ground-floor.png` is a synthetic semi-detached ground
floor drawn from exact millimetre coordinates. Create a project, upload it,
then calibrate on the printed **8,400** dimension — a correct calibration
reads 8.333 mm/pixel and every printed dimension checks out at ~0.0%.

Being synthetic, it flatters the extractor. Your real drawing is the honest test.

---

## The Phase 1 flow

1. **Import** — upload a PDF or image per storey. PDFs are rendered page by
   page in the browser; multi-page PDFs ask you which page is which level
   rather than guessing. Everything is normalised to a PNG capped at 2200px on
   the long edge, and that one image is what Claude reads, what you click
   during calibration, and what the editor draws over — one pixel space, no
   re-scaling between steps.
2. **Read with Claude** — a vision pass returns observations in **image
   pixels**: walls, openings, rooms, stairs, printed dimensions, and a `notes`
   list of everything it was unsure about. It is never asked for a real-world
   size it cannot read off the page, so it cannot invent a scale. Structured
   outputs enforce the schema, with a text-recovery fallback.
3. **Calibrate (mandatory)** — click two points, type the real distance. That
   sets mm-per-pixel and converts the extraction into millimetre geometry.
   Printed dimensions are then cross-checked against your scale; anything off
   by more than 2% is flagged, with a one-click "rescale to match the printed
   dimensions instead".
4. **Edit** — the plan sits underneath, detected geometry on top. Drag wall
   endpoints, draw walls, add and delete doors and windows, rename rooms and
   set their use. Snaps to 50mm, to existing wall corners (within 200mm), and
   to right angles (hold **Alt** to override). Hover or select a wall for its
   length.
5. **Save a version** — versions are append-only and immutable, each recording
   the version it came from. Nothing is ever overwritten, so Phase 4's AI edits
   and the existing/proposed comparison have somewhere to live.

### What the import flags rather than guesses

A plan view physically cannot show some things. Those become clearly-labelled
defaults in `src/lib/model/importDefaults.ts` **plus an entry in the import
notes panel**, never a silent number:

- opening heights and window sill heights,
- floor-to-ceiling and floor build-up heights,
- wall thickness where the plan draws a single line,
- stair rise and going (treads are counted; the rest needs the real
  floor-to-floor height).

Load-bearing status is never inferred at all — every imported wall is
`structural: "unknown"`, which Phase 5 will flag.

Anything inconsistent is dropped with a warning rather than repaired: an
opening that does not sit on its wall, a zero-length wall, a room with fewer
than three corners. A visibly missing wall is safer than one that quietly moved.

---

## Known limitations (Phase 1)

- **The vision extraction has not been run against the live API from this
  build.** No `ANTHROPIC_API_KEY` was available in the environment it was
  written in, so the prompt, the schema and the pixel→mm conversion are tested
  by unit tests and by an end-to-end browser run that exercises everything
  *except* the network call. The first real plan you import is the first live
  test of the prompt; expect to tune it.
- **Supabase is untested against a live project.** The adapter and
  `supabase/schema.sql` are written but have never talked to a real instance.
  IndexedDB is the tested path. The SQL policies as written trust the anon key
  — fine for a private single-user project, not for anything public.
- Calibration is a uniform scale plus a translation: no rotation or de-skew. A
  photographed or skewed plan will not fit properly. Scan or export flat.
- The editor cannot draw new room polygons — it names, re-classifies and
  deletes the rooms the extractor found. Rooms are not auto-derived from wall
  loops yet.
- Walls are independent line segments; there is no junction cleanup, so moving
  one endpoint does not drag its neighbours. Corner snapping keeps junctions
  closed if you land on them.
- One plan image per level. Composite drawings with several storeys on one
  sheet need cropping first.
- No auth, so Supabase mode is single-user by construction.
- Stair geometry is recorded but not yet validated — that is Phase 4's stair
  calculator and Phase 5's Part K rules.

## What to verify manually after importing your plan

1. **The scale.** Check the printed-dimension cross-check panel, then measure
   one wall in the app against the real house with a tape. Everything else
   inherits this error.
2. **Wall thicknesses**, especially anything that came in as an assumed default.
3. **Every opening height and sill height** — all assumptions. Part B escape
   window checks in Phase 5 depend on sill heights being real.
4. **Floor-to-ceiling and floor build-up per storey** (Level panel). Stair and
   headroom checks are built on these.
5. **Which walls are load-bearing.** Nothing can infer this from a drawing.
6. Rooms that came in unlabelled, and any room whose use was guessed.

---

## Layout

```
src/lib/model/         schema (Zod), factories, import defaults, extraction → model
src/lib/geometry/      snapping, ortho constraint, areas, hit-testing
src/lib/calibration/   pixel ↔ mm, printed-dimension cross-check
src/lib/ai/            extraction schema, system prompt, Claude call (server only)
src/lib/plan/          PDF/image → normalised PNG
src/lib/storage/       IndexedDB and Supabase adapters behind one interface
src/state/             Zustand store — project, model, versions, editor state
src/components/        plan canvas and the sidebar panels
src/app/api/extract-plan/   the vision route
scripts/               pdf worker copy, synthetic sample plan generator
supabase/schema.sql    optional backend
```

Tests sit next to what they test (`*.test.ts`) and run in Node with no DOM.

---

## Next phases

2. 3D viewer (extrude from the JSON, cut openings, stack levels, stairs, roof,
   walk mode, section cut, existing/proposed colour coding).
3. Finishes — paint, wallpaper, floors, per room or per wall face; lighting presets.
4. AI design assistant — natural-language edits returned as RFC 6902 JSON
   Patches against the model, applied to a **new** version with a diff to accept.
5. UK compliance heuristics — deterministic TypeScript rules, every threshold in
   one `ukRules.config.ts` with a source label and a `lastVerified` date, for you
   to check against gov.uk Approved Documents and the Planning Portal.
6. Render export — saved camera views, high-res PNGs, and a render brief for
   Higgsfield with your own house photos as style references.
