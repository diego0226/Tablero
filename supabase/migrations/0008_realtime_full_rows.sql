-- ─────────────────────────────────────────────────────────────────────────
-- Que Realtime mande la fila completa.
--
-- El problema: una fila de `prospects` pesa ~2,5 KB (tres mensajes redactados
-- + señales + enlaces) y supera el umbral de TOAST de Postgres (~2 KB), así
-- que las columnas más grandes se guardan fuera de línea. Cuando se actualiza
-- un solo campo pequeño —cambiar `status` desde el tablero— esas columnas no
-- se reescriben, el WAL no las repite y Realtime las manda en `null`.
--
-- Resultado: los demás navegadores recibían una ficha a medias. El cliente ya
-- es inmune (fusiona la fila remota sobre la local y, si vino recortada, pide
-- la fila entera: ver `normalizeProspect` en src/lib/prospects.ts). Esta
-- migración ataca el origen para que ese camino de recuperación casi nunca
-- haga falta: subiendo `toast_tuple_target` al máximo (8160 B), estas filas
-- caben enteras en la página y dejan de partirse.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.prospects        set (toast_tuple_target = 8160);
alter table public.prospect_scripts set (toast_tuple_target = 8160);
alter table public.tasks            set (toast_tuple_target = 8160);

-- `toast_tuple_target` solo aplica al escribir, así que hay que reescribir lo
-- que ya existe. Ojo: en un UPDATE, Postgres reaprovecha el puntero TOAST de
-- las columnas cuyo valor no cambió — `set notes = notes` no las traería de
-- vuelta a la página. Hay que producir un dato nuevo (`|| ''` en texto,
-- `::text::jsonb` en jsonb) para que se vuelva a decidir dónde guardarlo.
--
-- Los triggers de auditoría se apagan durante la reescritura: ponen
-- `updated_by = auth.uid()`, que fuera de una sesión de usuario es null y
-- borraría de quién fue el último cambio en todas las filas.
do $$
begin
  alter table public.prospects disable trigger trg_prospects_touch;
  update public.prospects set
    appointment_fit = appointment_fit || '',
    pain            = pain            || '',
    angle           = angle           || '',
    channel_note    = channel_note    || '',
    personalization = personalization || '',
    avoid           = avoid           || '',
    msg_ig          = msg_ig          || '',
    msg_wa          = msg_wa          || '',
    msg_followup    = msg_followup    || '',
    next_step       = next_step       || '',
    notes           = notes           || '',
    links           = links::text::jsonb,
    signals         = signals::text::jsonb,
    unverified      = unverified::text::jsonb;
  alter table public.prospects enable trigger trg_prospects_touch;

  alter table public.prospect_scripts disable trigger trg_prospect_scripts_touch;
  update public.prospect_scripts set body = body || '', title = title || '';
  alter table public.prospect_scripts enable trigger trg_prospect_scripts_touch;

  alter table public.tasks disable trigger trg_tasks_defaults;
  alter table public.tasks disable trigger trg_tasks_updated_at;
  update public.tasks set
    title       = title       || '',
    description = description || '',
    subtasks    = subtasks::text::jsonb;
  alter table public.tasks enable trigger trg_tasks_defaults;
  alter table public.tasks enable trigger trg_tasks_updated_at;
end $$;

-- Comprobación: las tablas de TOAST deberían quedar vacías.
--   select count(*) from pg_toast.pg_toast_<reltoastrelid de la tabla>;
