-- Migration 002: Mac render queue and safe VYRON channel mirror (no OAuth tokens).
-- Run AFTER 001_owner_tables.sql in the same Supabase project.
alter table public.studio_v2_channels
  add column if not exists vyron_channel_id text,
  add column if not exists youtube_channel_id text;
create index if not exists studio_v2_channels_youtube_idx
  on public.studio_v2_channels(owner_id,youtube_channel_id);
create table if not exists public.studio_v2_mac_jobs(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.studio_v2_projects(id) on delete cascade,
  action text not null default 'render_endlume'
    check (action in ('render_endlume')),
  status text not null default 'queued'
    check (status in ('queued','claimed','running','completed','error','cancelled')),
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  worker_id text,
  attempts integer not null default 0 check (attempts between 0 and 50),
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_worker_short check (worker_id is null or char_length(worker_id)<=120),
  constraint job_payload_max check (pg_column_size(payload)<100000)
);
create index if not exists studio_v2_mac_jobs_claim_idx
 on public.studio_v2_mac_jobs(owner_id,status,created_at);
create index if not exists studio_v2_mac_jobs_project_idx
 on public.studio_v2_mac_jobs(owner_id,project_id,created_at desc);
alter table public.studio_v2_mac_jobs enable row level security;
revoke all on public.studio_v2_mac_jobs from anon;
grant select,insert,update,delete on public.studio_v2_mac_jobs to authenticated;
drop policy if exists studio_v2_mac_jobs_select on public.studio_v2_mac_jobs;
drop policy if exists studio_v2_mac_jobs_insert on public.studio_v2_mac_jobs;
drop policy if exists studio_v2_mac_jobs_update on public.studio_v2_mac_jobs;
drop policy if exists studio_v2_mac_jobs_delete on public.studio_v2_mac_jobs;
create policy studio_v2_mac_jobs_select on public.studio_v2_mac_jobs
 for select to authenticated using ((select auth.uid())=owner_id);
create policy studio_v2_mac_jobs_insert on public.studio_v2_mac_jobs
 for insert to authenticated with check (
   (select auth.uid())=owner_id
   and exists(select 1 from public.studio_v2_projects p
    where p.id=project_id and p.owner_id=(select auth.uid()))
 );
create policy studio_v2_mac_jobs_update on public.studio_v2_mac_jobs
 for update to authenticated using ((select auth.uid())=owner_id)
 with check ((select auth.uid())=owner_id);
create policy studio_v2_mac_jobs_delete on public.studio_v2_mac_jobs
 for delete to authenticated using ((select auth.uid())=owner_id);
drop trigger if exists studio_v2_mac_jobs_touch on public.studio_v2_mac_jobs;
create trigger studio_v2_mac_jobs_touch
 before update on public.studio_v2_mac_jobs
 for each row execute function public.studio_v2_set_updated_at();
-- Atomic claim: no two healthy agents can lease the same job.
-- No automatic re-claiming of stale rendering jobs: manual retry avoids duplicate renders.
create or replace function public.studio_v2_claim_mac_job(p_worker text)
returns setof public.studio_v2_mac_jobs language plpgsql security invoker
set search_path = '' as $$
begin
 if (select auth.uid()) is null then raise exception 'authentication required'; end if;
 if p_worker is null or length(trim(p_worker)) < 8 or length(p_worker)>120
 then raise exception 'invalid worker id'; end if;
 return query
 with item as (
   select j.id from public.studio_v2_mac_jobs j
   where j.owner_id=(select auth.uid()) and j.status='queued'
   order by j.created_at,j.id for update skip locked limit 1
 )
 update public.studio_v2_mac_jobs j
 set status='claimed',worker_id=p_worker,claimed_at=now(),heartbeat_at=now(),attempts=j.attempts+1
 from item
 where j.id=item.id
 returning j.*;
end;$$;
revoke execute on function public.studio_v2_claim_mac_job(text) from public,anon;
grant execute on function public.studio_v2_claim_mac_job(text) to authenticated;
-- Atomic worker-owned progress transitions, preventing a different agent from
-- overwriting a claim that it does not own.
create or replace function public.studio_v2_worker_update(
 p_job uuid,p_worker text,p_status text,p_result jsonb default '{}'::jsonb,p_error text default null
) returns boolean language plpgsql security invoker
set search_path = '' as $$
declare updated_count integer;
begin
 if (select auth.uid()) is null then return false; end if;
 if p_status not in ('claimed','running','completed','error') then return false; end if;
 update public.studio_v2_mac_jobs j
 set status=p_status,
     result=coalesce(p_result,'{}'::jsonb),
     heartbeat_at=now(),
     completed_at=case when p_status in ('completed','error') then now() else null end,
     error_message=left(p_error,500)
 where j.id=p_job and j.owner_id=(select auth.uid()) and j.worker_id=p_worker
   and j.status in ('claimed','running');
 get diagnostics updated_count=row_count;
 return updated_count=1;
end;$$;
revoke execute on function public.studio_v2_worker_update(uuid,text,text,jsonb,text) from public,anon;
grant execute on function public.studio_v2_worker_update(uuid,text,text,jsonb,text) to authenticated;

-- Device presence: the site shows only heartbeats written by its owner.
create table if not exists public.studio_v2_mac_devices(
  id text primary key check (char_length(id) between 8 and 120),
  owner_id uuid not null references auth.users(id) on delete cascade,
  device_name text not null default 'Mac',
  agent_version text not null default 'unknown',
  endlume_status text not null default 'not_detected',
  vyron_channels integer not null default 0,
  last_seen timestamptz not null default now()
);
create index if not exists studio_v2_devices_owner_seen_idx
 on public.studio_v2_mac_devices(owner_id,last_seen desc);
alter table public.studio_v2_mac_devices enable row level security;
revoke all on public.studio_v2_mac_devices from anon;
grant select,insert,update,delete on public.studio_v2_mac_devices to authenticated;
drop policy if exists studio_v2_devices_select on public.studio_v2_mac_devices;
drop policy if exists studio_v2_devices_insert on public.studio_v2_mac_devices;
drop policy if exists studio_v2_devices_update on public.studio_v2_mac_devices;
drop policy if exists studio_v2_devices_delete on public.studio_v2_mac_devices;
create policy studio_v2_devices_select on public.studio_v2_mac_devices for select to authenticated using ((select auth.uid())=owner_id);
create policy studio_v2_devices_insert on public.studio_v2_mac_devices for insert to authenticated with check ((select auth.uid())=owner_id);
create policy studio_v2_devices_update on public.studio_v2_mac_devices for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy studio_v2_devices_delete on public.studio_v2_mac_devices for delete to authenticated using ((select auth.uid())=owner_id);
