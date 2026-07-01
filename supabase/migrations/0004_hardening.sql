-- ─────────────────────────────────────────────────────────────────────────
-- Endurecimiento del tablero (auditoría, integridad y autorización real).
-- Resuelve:
--   C-1  Autorización por lista explícita (tabla team_members), no por el
--        sufijo del email del JWT.
--   C-2  Generación atómica de `code` y `sort_order` en el servidor (trigger),
--        eliminando la carrera del cliente que provocaba códigos duplicados.
--   A-5  Columnas de auditoría created_by / updated_by.
-- Ejecuta este archivo en Supabase → SQL Editor (o con la CLI).
-- ─────────────────────────────────────────────────────────────────────────

-- ── A-5 · Auditoría ────────────────────────────────────────────────────────
alter table public.tasks add column if not exists created_by uuid;
alter table public.tasks add column if not exists updated_by uuid;

-- ── C-1 · Lista explícita de miembros del equipo ──────────────────────────
-- La pertenencia al equipo deja de depender de que el email termine en
-- @tablero.razor (que cualquiera podría registrar si el signup público
-- estuviera activo). Ahora es una allowlist de UIDs mantenida solo por el
-- service_role (los scripts de seed). Sin políticas RLS propias, la tabla es
-- invisible para el rol `authenticated`: solo el service_role la lee/escribe.
create table if not exists public.team_members (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  username text,
  added_at timestamptz not null default now()
);
alter table public.team_members enable row level security;

-- Migra a la nueva tabla los usuarios que ya existían por dominio, para no
-- dejar a nadie fuera al aplicar esta migración.
insert into public.team_members (user_id, username)
select id, split_part(email, '@', 1)
from auth.users
where email like '%@tablero.razor'
on conflict (user_id) do nothing;

-- La comprobación de pertenencia ahora consulta la tabla (SECURITY DEFINER
-- para poder leerla desde políticas RLS bajo el rol `authenticated`).
create or replace function public.is_team_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_members where user_id = auth.uid()
  );
$$;

-- ── C-2 · Código y orden atómicos en el servidor ──────────────────────────
create table if not exists public.epic_counters (
  ep text primary key check (ep in ('A','B','C','D')),
  n  int not null default 0
);

-- Inicializa cada contador con el número más alto ya usado por su épica.
insert into public.epic_counters (ep, n)
select ep, coalesce(max(nullif(regexp_replace(code, '\D', '', 'g'), '')::int), 0)
from public.tasks
group by ep
on conflict (ep) do update set n = greatest(public.epic_counters.n, excluded.n);

-- Asigna code / sort_order / created_by en el INSERT, de forma atómica.
-- El cliente ya NO calcula el código: si llega vacío, lo genera el servidor.
create or replace function public.tasks_assign_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  if new.code is null or new.code = '' then
    insert into public.epic_counters (ep, n)
    values (new.ep, 1)
    on conflict (ep) do update set n = public.epic_counters.n + 1
    returning n into v_n;
    new.code := new.ep || v_n;
  end if;

  if new.sort_order is null or new.sort_order = 0 then
    select coalesce(max(sort_order), 0) + 1 into new.sort_order from public.tasks;
  end if;

  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  new.updated_by := auth.uid();

  return new;
end $$;

drop trigger if exists trg_tasks_defaults on public.tasks;
create trigger trg_tasks_defaults
  before insert on public.tasks
  for each row execute function public.tasks_assign_defaults();

-- Mantén updated_at y registra quién actualizó en cada UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end $$;

-- ── Reafirma las políticas del equipo (ahora basadas en la tabla) ─────────
drop policy if exists "tasks_select_team" on public.tasks;
drop policy if exists "tasks_insert_team" on public.tasks;
drop policy if exists "tasks_update_team" on public.tasks;
drop policy if exists "tasks_delete_team" on public.tasks;

create policy "tasks_select_team" on public.tasks
  for select to authenticated using (public.is_team_member());
create policy "tasks_insert_team" on public.tasks
  for insert to authenticated with check (public.is_team_member());
create policy "tasks_update_team" on public.tasks
  for update to authenticated using (public.is_team_member()) with check (public.is_team_member());
create policy "tasks_delete_team" on public.tasks
  for delete to authenticated using (public.is_team_member());
