-- ─────────────────────────────────────────────────────────────────────────
-- Tablero Navaja — esquema inicial
-- Ejecuta este archivo en Supabase → SQL Editor (o con la CLI de Supabase).
-- ─────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,                 -- A1, B2, ...
  ep          text not null check (ep in ('A','B','C','D')),
  prio        text not null check (prio in ('alta','media','baja')),
  status      text not null check (status in ('todo','progress','review','done')),
  title       text not null,
  description text not null default '',
  assignee    text not null default '',
  subtasks    jsonb not null default '[]'::jsonb,
  sort_order  double precision not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- mantener updated_at al día
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ─── Seguridad (RLS) ──────────────────────────────────────────────────────
-- Tablero compartido: cualquier usuario autenticado puede leer y escribir.
-- El público anónimo no tiene ningún acceso.
alter table public.tasks enable row level security;

drop policy if exists "tasks_select_authenticated" on public.tasks;
drop policy if exists "tasks_insert_authenticated" on public.tasks;
drop policy if exists "tasks_update_authenticated" on public.tasks;
drop policy if exists "tasks_delete_authenticated" on public.tasks;

create policy "tasks_select_authenticated" on public.tasks
  for select to authenticated using (true);
create policy "tasks_insert_authenticated" on public.tasks
  for insert to authenticated with check (true);
create policy "tasks_update_authenticated" on public.tasks
  for update to authenticated using (true) with check (true);
create policy "tasks_delete_authenticated" on public.tasks
  for delete to authenticated using (true);

-- ─── Realtime ─────────────────────────────────────────────────────────────
-- Para que los 3 vean los cambios en vivo.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
end $$;
