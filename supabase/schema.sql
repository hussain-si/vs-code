-- =====================================================================
--  CodeVault – Supabase schema
--  Run this whole file ONCE in: Supabase Dashboard → SQL Editor → New query
--  It is safe to run again (idempotent).
--
--  Design
--  • public.nodes      → the folder / file tree (names, parents, sizes)
--  • storage "user-files" bucket → the actual file bytes, any size,
--                          stored at  <user_id>/<node_id>
--  Every user can only see and change their own rows and objects (RLS).
-- =====================================================================


-- 1. Tree table ---------------------------------------------------------
create table if not exists public.nodes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
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

-- No two siblings with the same name (root level included, where parent_id is null).
create unique index if not exists nodes_unique_name
  on public.nodes (user_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), name);

create index if not exists nodes_parent_idx on public.nodes (parent_id);


-- 2. Integrity trigger: same-owner parent, parent is a folder, no cycles --
create or replace function public.nodes_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_row record;
  cursor_id uuid;
begin
  new.updated_at := now();

  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;   -- ownership never changes
    new.type    := old.type;      -- a file stays a file
  end if;

  if new.parent_id is not null then
    select user_id, type into parent_row from public.nodes where id = new.parent_id;
    if not found or parent_row.user_id <> new.user_id then
      raise exception 'Parent folder not found';
    end if;
    if parent_row.type <> 'folder' then
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


-- 3. Row Level Security for the tree ------------------------------------
alter table public.nodes enable row level security;

grant select, insert, update, delete on public.nodes to authenticated;

drop policy if exists "nodes: select own" on public.nodes;
create policy "nodes: select own" on public.nodes
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "nodes: insert own" on public.nodes;
create policy "nodes: insert own" on public.nodes
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "nodes: update own" on public.nodes;
create policy "nodes: update own" on public.nodes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "nodes: delete own" on public.nodes;
create policy "nodes: delete own" on public.nodes
  for delete to authenticated using ((select auth.uid()) = user_id);


-- 4. Private storage bucket for file contents ----------------------------
-- file_size_limit = null  → only the project-wide limit applies
-- (Project Settings → Storage → "Upload file size limit").
insert into storage.buckets (id, name, public, file_size_limit)
values ('user-files', 'user-files', false, null)
on conflict (id) do update set public = false, file_size_limit = null;

drop policy if exists "user-files: read own" on storage.objects;
create policy "user-files: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'user-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "user-files: insert own" on storage.objects;
create policy "user-files: insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'user-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "user-files: update own" on storage.objects;
create policy "user-files: update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'user-files' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'user-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "user-files: delete own" on storage.objects;
create policy "user-files: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'user-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
