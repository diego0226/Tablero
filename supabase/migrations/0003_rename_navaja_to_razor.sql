-- Renombra el proyecto de "Navaja" a "Razor".
-- El dominio sintético interno de los emails pasa de @tablero.navaja a
-- @tablero.razor. Hay que actualizar usuarios, identidades y la política RLS
-- de forma consistente para que el login siga funcionando.

-- 1) Emails de los usuarios del equipo
update auth.users
set email = replace(email, '@tablero.navaja', '@tablero.razor')
where email like '%@tablero.navaja';

-- 2) Identidades (el email vive dentro de identity_data)
update auth.identities
set identity_data = jsonb_set(
      identity_data,
      '{email}',
      to_jsonb(replace(identity_data->>'email', '@tablero.navaja', '@tablero.razor'))
    )
where identity_data->>'email' like '%@tablero.navaja';

-- 3) Política RLS: el tablero solo lo tocan los usuarios @tablero.razor
create or replace function public.is_team_member()
returns boolean
language sql stable
as $$
  select coalesce((auth.jwt() ->> 'email') like '%@tablero.razor', false);
$$;

-- 4) Contenido: subdominio de ejemplo en la tarea D2
update public.tasks
set description = replace(description, 'barberia.navaja.cr', 'barberia.razor.cr')
where description like '%barberia.navaja.cr%';
