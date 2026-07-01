-- Cierra objetos internos expuestos por PostgREST (hallazgos del advisor tras
-- aplicar 0004). Ejecutar después de 0004.

-- ERROR: epic_counters quedó sin RLS => accesible por anon/authenticated vía la
-- API REST (podrían manipular los contadores y forzar códigos duplicados). Con
-- RLS activa y sin políticas queda invisible para la API; el trigger
-- (SECURITY DEFINER, dueño de la tabla) sigue pudiendo actualizarla.
alter table public.epic_counters enable row level security;

-- WARN: las funciones de trigger no deben ser invocables por RPC. Un trigger se
-- dispara por el sistema sin depender del privilegio EXECUTE del usuario, así
-- que revocarlo es seguro.
revoke execute on function public.tasks_assign_defaults() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- is_team_member se usa dentro de las políticas RLS del rol `authenticated`, así
-- que conserva EXECUTE para ese rol; se retira de anon/public (no lo necesitan).
revoke execute on function public.is_team_member() from public, anon;
grant execute on function public.is_team_member() to authenticated, service_role;
