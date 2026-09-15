-- houseproj — Supabase schema (optional backend)
--
-- The app runs entirely on browser-local IndexedDB unless
-- NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.
-- Apply this file only if you want projects synced across devices.
--
-- NOTE: this is written for the single-user case described in the brief and
-- has NOT been run against a live Supabase project yet. The policies below are
-- permissive to the anon key on purpose — that is only safe for a private
-- project. Before putting anything real behind it, turn on Supabase Auth and
-- replace the policies with owner checks (see the commented block at the end).

create table if not exists public.projects (
  id          text primary key,
  name        text        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- site, planImages, calibrations, currentVersion
  data        jsonb       not null default '{}'::jsonb
);

create table if not exists public.model_versions (
  project_id     text        not null references public.projects (id) on delete cascade,
  version        integer     not null,
  parent_version integer,
  label          text        not null default '',
  source         text        not null check (source in ('import', 'manual-edit', 'ai-edit', 'recalibrate')),
  created_at     timestamptz not null default now(),
  -- A complete HouseModel document. Versions are immutable once written.
  model          jsonb       not null,
  primary key (project_id, version)
);

create index if not exists model_versions_project_idx
  on public.model_versions (project_id, version desc);

-- Plan images and reference photos.
insert into storage.buckets (id, name, public)
values ('plans', 'plans', true)
on conflict (id) do nothing;

alter table public.projects       enable row level security;
alter table public.model_versions enable row level security;

-- Single-user, private project: the anon key is the only key in play.
drop policy if exists projects_anon_all on public.projects;
create policy projects_anon_all on public.projects
  for all to anon using (true) with check (true);

drop policy if exists model_versions_anon_all on public.model_versions;
create policy model_versions_anon_all on public.model_versions
  for all to anon using (true) with check (true);

drop policy if exists plans_anon_all on storage.objects;
create policy plans_anon_all on storage.objects
  for all to anon using (bucket_id = 'plans') with check (bucket_id = 'plans');

-- When you add Supabase Auth, drop the three policies above and use these
-- instead, after adding an `owner uuid references auth.users` column to
-- projects and backfilling it:
--
-- create policy projects_owner on public.projects
--   for all to authenticated
--   using (owner = auth.uid()) with check (owner = auth.uid());
--
-- create policy model_versions_owner on public.model_versions
--   for all to authenticated
--   using (exists (select 1 from public.projects p
--                  where p.id = project_id and p.owner = auth.uid()));
