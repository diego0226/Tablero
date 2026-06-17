-- Restringe el tablero a los usuarios del equipo (@tablero.navaja).
-- Defensa en profundidad: aunque el registro público esté activo y alguien
-- se registre con otro email, NO podrá leer ni escribir tareas.
-- (El dominio sintético @tablero.navaja es rechazado por el registro público,
--  así que solo los usuarios creados por un admin lo tienen.)

create or replace function public.is_team_member()
returns boolean
language sql stable
as $$
  select coalesce((auth.jwt() ->> 'email') like '%@tablero.navaja', false);
$$;

drop policy if exists "tasks_select_authenticated" on public.tasks;
drop policy if exists "tasks_insert_authenticated" on public.tasks;
drop policy if exists "tasks_update_authenticated" on public.tasks;
drop policy if exists "tasks_delete_authenticated" on public.tasks;

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
