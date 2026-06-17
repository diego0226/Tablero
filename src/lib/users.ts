// Usuarios permitidos del tablero. El registro público está deshabilitado:
// estos tres usuarios se crean con el script `npm run seed:users` y son los
// únicos que pueden iniciar sesión.
//
// Como Supabase Auth trabaja con email, mapeamos cada "usuario" a un email
// sintético interno (usuario@tablero.razor). El usuario nunca ve ese email:
// solo escribe su nombre de usuario y su contraseña.
//
// ⚠️ Si cambias esta lista, actualiza también `scripts/seed-users.mjs`.

export const AUTH_DOMAIN = "tablero.razor";

export type AppUser = {
  username: string;
  name: string;
  color: string;
};

// Color fijo por persona (avatar del header y de responsable en las tarjetas).
export const USERS: AppUser[] = [
  { username: "diego", name: "Diego Zamora", color: "#D64545" }, // rojo
  { username: "keylor", name: "Keylor Barrantes", color: "#1D7A5F" }, // verde
  { username: "pablo", name: "Pablo Jiménez", color: "#3B7CB0" }, // azul
];

const DEFAULT_COLOR = "#6B6B66";

export function emailForUsername(username: string): string {
  return `${username.trim().toLowerCase()}@${AUTH_DOMAIN}`;
}

// Devuelve el color asignado a una persona por su nombre (con respaldo neutro).
export function colorForName(name: string): string {
  if (!name) return DEFAULT_COLOR;
  const target = name.trim().toLowerCase();
  const u = USERS.find((u) => u.name.toLowerCase() === target);
  return u ? u.color : DEFAULT_COLOR;
}
