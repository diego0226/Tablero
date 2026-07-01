-- Arregla la generación de código: los códigos son globales e inmutables, pero
-- una tarea puede cambiar de épica en la app (su código conserva el prefijo
-- original). Por eso el contador debe basarse en el PREFIJO del código, no en la
-- épica actual, y además avanzar hasta encontrar un código libre globalmente.
--
-- Síntoma que corrige: al crear una tarea el trigger generaba p.ej. "B21" cuando
-- ya existía "B21" (movida a otra épica) => unique_violation 23505 => "no deja
-- agregar tareas".

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
    -- asegura que exista la fila del contador de esa épica
    insert into public.epic_counters (ep, n) values (new.ep, 0)
    on conflict (ep) do nothing;

    -- bloquea la fila (serializa inserts concurrentes de la misma épica) y
    -- auto-sana contra el mayor número usado por CUALQUIER código con ese
    -- prefijo, aunque su tarea haya cambiado de épica.
    update public.epic_counters
    set n = greatest(n, coalesce(
              (select max(nullif(regexp_replace(code, '\D', '', 'g'), '')::int)
               from public.tasks where code like new.ep || '%'), 0))
    where ep = new.ep
    returning n into v_n;

    -- avanza hasta el primer código libre globalmente
    loop
      v_n := v_n + 1;
      new.code := new.ep || v_n;
      exit when not exists (select 1 from public.tasks where code = new.code);
    end loop;

    update public.epic_counters set n = v_n where ep = new.ep;
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

-- Resincroniza los contadores al máximo por prefijo (arregla la deriva actual).
update public.epic_counters c
set n = greatest(c.n, coalesce((
  select max(nullif(regexp_replace(t.code, '\D', '', 'g'), '')::int)
  from public.tasks t where t.code like c.ep || '%'), 0));
