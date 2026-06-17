// Usuarios permitidos del tablero. El registro público está deshabilitado:
// estos tres usuarios se crean con el script `npm run seed:users` y son los
// únicos que pueden iniciar sesión.
//
// Como Supabase Auth trabaja con email, mapeamos cada "usuario" a un email
// sintético interno (usuario@tablero.navaja). El usuario nunca ve ese email:
// solo escribe su nombre de usuario y su contraseña.
//
// ⚠️ Si cambias esta lista, actualiza también `scripts/seed-users.mjs`.

export const AUTH_DOMAIN = "tablero.navaja";

export type AppUser = {
  username: string;
  name: string;
};

export const USERS: AppUser[] = [
  { username: "diego", name: "Diego Zamora" },
  { username: "keylor", name: "Keylor Barrantes" },
  { username: "pablo", name: "Pablo Jiménez" },
];

export function emailForUsername(username: string): string {
  return `${username.trim().toLowerCase()}@${AUTH_DOMAIN}`;
}
