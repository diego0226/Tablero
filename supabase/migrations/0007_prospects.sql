-- ─────────────────────────────────────────────────────────────────────────
-- Prospección comercial (Grecia y siguientes zonas).
--
-- Dos tablas:
--   · prospects        — una fila por ficha de negocio, con los datos
--                        verificados, los mensajes ya redactados y el estado
--                        compartido del equipo (estado + notas).
--   · prospect_scripts — guiones de objeción globales; {{N}} se sustituye por
--                        el nombre del negocio al copiarlos.
--
-- Misma seguridad que `tasks`: solo los UIDs de public.team_members, vía
-- public.is_team_member() (migración 0004).
-- ─────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ── Fichas ────────────────────────────────────────────────────────────────
create table if not exists public.prospects (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,          -- identificador corto y estable
  name            text not null,
  kind            text not null default '',      -- rubro: "Barbería", "Salón de belleza"…
  segment         text not null default '',      -- agrupador: Belleza, Salud, Uñas…
  zone            text not null default '',
  phone           text not null default '',
  whatsapp        text,                          -- E.164 sin '+': 50688887777; null si no hay
  links           jsonb not null default '[]'::jsonb,  -- [{"label":"Maps","url":"https://…"}]
  score           int  not null default 0,
  priority        text not null check (priority in ('A','B','C')),
  appointment_fit text not null default '',      -- probabilidad de trabajar con citas
  signals         jsonb not null default '[]'::jsonb,  -- señales verificadas (array de texto)
  unverified      jsonb not null default '[]'::jsonb,  -- lo que NO está confirmado
  pain            text not null default '',
  angle           text not null default '',
  channel         text not null default '',
  channel_note    text not null default '',
  personalization text not null default '',
  avoid           text not null default '',      -- qué NO decirle a este negocio
  msg_ig          text not null default '',
  msg_wa          text not null default '',
  msg_followup    text not null default '',
  next_step       text not null default '',
  -- estado compartido (antes vivía en localStorage, por navegador)
  status          text not null default 'pendiente'
                    check (status in ('pendiente','contactado','respondió','agendado','no contactar')),
  notes           text not null default '',
  status_changed_at timestamptz,
  sort_order      double precision not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid,
  updated_by      uuid
);

create index if not exists prospects_priority_idx on public.prospects (priority, sort_order);
create index if not exists prospects_status_idx   on public.prospects (status);

-- ── Guiones globales ──────────────────────────────────────────────────────
create table if not exists public.prospect_scripts (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  title      text not null,
  body       text not null,
  sort_order double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- ── Triggers ──────────────────────────────────────────────────────────────
-- Auditoría + marca de cuándo cambió el estado (para saber a quién toca seguir).
create or replace function public.prospects_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.created_by is null then
      new.created_by := auth.uid();
    end if;
    if new.sort_order is null or new.sort_order = 0 then
      select coalesce(max(sort_order), 0) + 1 into new.sort_order from public.prospects;
    end if;
    if new.status is distinct from 'pendiente' then
      new.status_changed_at := now();
    end if;
  else
    new.updated_at := now();
    if new.status is distinct from old.status then
      new.status_changed_at := now();
    end if;
  end if;
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists trg_prospects_touch on public.prospects;
create trigger trg_prospects_touch
  before insert or update on public.prospects
  for each row execute function public.prospects_touch();

create or replace function public.prospect_scripts_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists trg_prospect_scripts_touch on public.prospect_scripts;
create trigger trg_prospect_scripts_touch
  before insert or update on public.prospect_scripts
  for each row execute function public.prospect_scripts_touch();

-- Las funciones de trigger no deben poder invocarse por RPC (igual que 0005).
revoke execute on function public.prospects_touch() from public, anon, authenticated;
revoke execute on function public.prospect_scripts_touch() from public, anon, authenticated;

-- ── Seguridad (RLS) ───────────────────────────────────────────────────────
alter table public.prospects        enable row level security;
alter table public.prospect_scripts enable row level security;

drop policy if exists "prospects_select_team" on public.prospects;
drop policy if exists "prospects_insert_team" on public.prospects;
drop policy if exists "prospects_update_team" on public.prospects;
drop policy if exists "prospects_delete_team" on public.prospects;

create policy "prospects_select_team" on public.prospects
  for select to authenticated using (public.is_team_member());
create policy "prospects_insert_team" on public.prospects
  for insert to authenticated with check (public.is_team_member());
create policy "prospects_update_team" on public.prospects
  for update to authenticated using (public.is_team_member()) with check (public.is_team_member());
create policy "prospects_delete_team" on public.prospects
  for delete to authenticated using (public.is_team_member());

drop policy if exists "prospect_scripts_select_team" on public.prospect_scripts;
drop policy if exists "prospect_scripts_insert_team" on public.prospect_scripts;
drop policy if exists "prospect_scripts_update_team" on public.prospect_scripts;
drop policy if exists "prospect_scripts_delete_team" on public.prospect_scripts;

create policy "prospect_scripts_select_team" on public.prospect_scripts
  for select to authenticated using (public.is_team_member());
create policy "prospect_scripts_insert_team" on public.prospect_scripts
  for insert to authenticated with check (public.is_team_member());
create policy "prospect_scripts_update_team" on public.prospect_scripts
  for update to authenticated using (public.is_team_member()) with check (public.is_team_member());
create policy "prospect_scripts_delete_team" on public.prospect_scripts
  for delete to authenticated using (public.is_team_member());

-- ── Realtime ──────────────────────────────────────────────────────────────
-- Para que los 3 vean el estado de cada ficha al instante y nadie escriba dos
-- veces al mismo negocio.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'prospects'
  ) then
    alter publication supabase_realtime add table public.prospects;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'prospect_scripts'
  ) then
    alter publication supabase_realtime add table public.prospect_scripts;
  end if;
end $$;
