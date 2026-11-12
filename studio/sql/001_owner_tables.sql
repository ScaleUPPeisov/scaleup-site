-- VYRON AI STUDIO: isolated schema objects for owner-only browser console.
-- Execute once in the SQL editor of your EXISTING Supabase project; does not touch prior apps.
create table if not exists public.studio_v2_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  channel text not null default '',
  topic text not null default '',
  project_date date,
  duration_minutes integer not null default 30 check (duration_minutes between 1 and 240),
  visual_every_seconds integer not null default 30 check (visual_every_seconds between 5 and 300),
  mode text not null default 'graphics' check (mode in ('script','video','graphics')),
  preset text not null default 'doc',
  quality text not null default '1080p · 30 FPS · H.264',
  voice text not null default 'lumean',
  status text not null default 'draft' check (status in ('draft','script','voicing','visuals','ready_for_render','rendering','finished','paused','error')),
  current_stage integer not null default 0 check (current_stage between 0 and 4),
  outline text not null default '',
  script_text text not null default '',
  seo jsonb not null default '{}'::jsonb,
  scenes jsonb not null default '[]'::jsonb,
  assets jsonb not null default '[]'::jsonb,
  jobs jsonb not null default '[]'::jsonb,
  usage jsonb not null default '[]'::jsonb,
  logs jsonb not null default '[]'::jsonb,
  scheduled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint studio_v2_topic_max check (char_length(topic) <= 300)
);
create index if not exists studio_v2_projects_owner_updated_idx
  on public.studio_v2_projects (owner_id, updated_at desc);
create table if not exists public.studio_v2_channels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 150),
  category text not null default '',
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);
create or replace function public.studio_v2_set_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists studio_v2_touch on public.studio_v2_projects;
create trigger studio_v2_touch before update on public.studio_v2_projects
for each row execute function public.studio_v2_set_updated_at();
alter table public.studio_v2_projects enable row level security;
alter table public.studio_v2_channels enable row level security;
revoke all on public.studio_v2_projects from anon;
revoke all on public.studio_v2_channels from anon;
grant select, insert, update, delete on public.studio_v2_projects to authenticated;
grant select, insert, update, delete on public.studio_v2_channels to authenticated;
drop policy if exists studio_v2_projects_own_select on public.studio_v2_projects;
drop policy if exists studio_v2_projects_own_insert on public.studio_v2_projects;
drop policy if exists studio_v2_projects_own_update on public.studio_v2_projects;
drop policy if exists studio_v2_projects_own_delete on public.studio_v2_projects;
create policy studio_v2_projects_own_select on public.studio_v2_projects for select to authenticated using ((select auth.uid())=owner_id);
create policy studio_v2_projects_own_insert on public.studio_v2_projects for insert to authenticated with check ((select auth.uid())=owner_id);
create policy studio_v2_projects_own_update on public.studio_v2_projects for update to authenticated
  using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy studio_v2_projects_own_delete on public.studio_v2_projects for delete to authenticated using ((select auth.uid())=owner_id);
drop policy if exists studio_v2_channels_own_select on public.studio_v2_channels;
drop policy if exists studio_v2_channels_own_insert on public.studio_v2_channels;
drop policy if exists studio_v2_channels_own_update on public.studio_v2_channels;
drop policy if exists studio_v2_channels_own_delete on public.studio_v2_channels;
create policy studio_v2_channels_own_select on public.studio_v2_channels for select to authenticated using ((select auth.uid())=owner_id);
create policy studio_v2_channels_own_insert on public.studio_v2_channels for insert to authenticated with check ((select auth.uid())=owner_id);
create policy studio_v2_channels_own_update on public.studio_v2_channels for update to authenticated
  using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy studio_v2_channels_own_delete on public.studio_v2_channels for delete to authenticated using ((select auth.uid())=owner_id);
