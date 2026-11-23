-- =====================================================================
--  CodeVault – Supabase schema  (no login: one shared storage)
--  Run this whole file in: Supabase Dashboard → SQL Editor → New query
--  Safe to run more than once. It also upgrades the earlier
--  login-based version of this schema if you ran that before.
--
--  WARNING: there is no authentication. Anyone who has the app URL
--  (or the publishable key, which is shipped inside the app) can read,
--  change and delete every file. Keep the URL private.
--
--  Design
--  • public.nodes                → the folder / file tree
--  • storage bucket "user-files" → the file bytes, any size, at <node_id>
-- =====================================================================


-- 1. Tree table ---------------------------------------------------------
create table if not exists public.nodes (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.nodes (id) on delete cascade,
  name        text not null,
  type        text not null check (type in ('file', 'folder')),
  size        bigint not null default 0,
  mime_type   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint nodes_name_valid check (
    char_length(name) between 1 and 255
    and name !~ '[/\\]'
    and name not in ('.', '..')
  )
);

-- Upgrade from the earlier login-based version (does nothing on a fresh install).
drop policy if exists "nodes: select own" on public.nodes;
drop policy if exists "nodes: insert own" on public.nodes;
drop policy if exists "nodes: update own" on public.nodes;
drop policy if exists "nodes: delete own" on public.nodes;
drop index if exists public.nodes_unique_name;
alter table public.nodes drop column if exists user_id cascade;

-- No two siblings with the same name (root level included, where parent_id is null).
create unique index if not exists nodes_unique_sibling_name
  on public.nodes (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), name);

create index if not exists nodes_parent_idx on public.nodes (parent_id);


-- 2. Integrity trigger: parent must be a folder, no cycles ---------------
create or replace function public.nodes_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_type text;
  cursor_id uuid;
begin
  new.updated_at := now();

  if tg_op = 'UPDATE' then
    new.type := old.type;   -- a file stays a file
  end if;

  if new.parent_id is not null then
    select type into parent_type from public.nodes where id = new.parent_id;
    if not found then
      raise exception 'Parent folder not found';
    end if;
    if parent_type <> 'folder' then
      raise exception 'Parent must be a folder';
    end if;

    if tg_op = 'UPDATE' and new.parent_id is distinct from old.parent_id then
      cursor_id := new.parent_id;
      while cursor_id is not null loop
        if cursor_id = new.id then
          raise exception 'Cannot move a folder into itself';
        end if;
        select parent_id into cursor_id from public.nodes where id = cursor_id;
      end loop;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists nodes_before_write on public.nodes;
create trigger nodes_before_write
  before insert or update on public.nodes
  for each row execute function public.nodes_before_write();


-- 3. Access: the app (publishable / anon key) may do everything ----------
alter table public.nodes enable row level security;

grant select, insert, update, delete on public.nodes to anon, authenticated;

drop policy if exists "nodes: public access" on public.nodes;
create policy "nodes: public access" on public.nodes
  for all to anon, authenticated
  using (true)
  with check (true);


-- 4. Storage bucket for file contents ------------------------------------
-- The bucket is private (no public URLs); the app reads it through the API.
-- file_size_limit = null → only the project-wide limit applies
-- (Project Settings → Storage → "Upload file size limit").
insert into storage.buckets (id, name, public, file_size_limit)
values ('user-files', 'user-files', false, null)
on conflict (id) do update set public = false, file_size_limit = null;

-- Remove the earlier per-user policies (if any).
drop policy if exists "user-files: read own" on storage.objects;
drop policy if exists "user-files: insert own" on storage.objects;
drop policy if exists "user-files: update own" on storage.objects;
drop policy if exists "user-files: delete own" on storage.objects;

drop policy if exists "user-files: public access" on storage.objects;
create policy "user-files: public access" on storage.objects
  for all to anon, authenticated
  using (bucket_id = 'user-files')
  with check (bucket_id = 'user-files');
