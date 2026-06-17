// Crea (o actualiza) los 3 usuarios del equipo en Supabase Auth.
// El registro público está deshabilitado, así que estos son los únicos
// usuarios que podrán iniciar sesión.
//
// Uso:  npm run seed:users
//
// ⚠️ Mantén esta lista sincronizada con src/lib/users.ts
// ⚠️ El dominio sintético `tablero.razor` debe coincidir con AUTH_DOMAIN.
import "./_env.mjs";
import { requireEnv } from "./_env.mjs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const AUTH_DOMAIN = "tablero.razor";

// Genera una contraseña aleatoria legible si no se define por variable de entorno.
const genPass = () =>
  "Tab-" + randomBytes(6).toString("base64url").replace(/[^a-zA-Z0-9]/g, "") + "-26";

// Las contraseñas NUNCA se guardan en el repo. Se toman de variables de entorno
// (SEED_PASS_DIEGO, etc.) o se generan al azar y se imprimen al final.
const USERS = [
  { username: "diego", name: "Diego Zamora", password: process.env.SEED_PASS_DIEGO || genPass() },
  { username: "keylor", name: "Keylor Barrantes", password: process.env.SEED_PASS_KEYLOR || genPass() },
  { username: "pablo", name: "Pablo Jiménez", password: process.env.SEED_PASS_PABLO || genPass() },
];

const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const emailFor = (u) => `${u.toLowerCase()}@${AUTH_DOMAIN}`;

async function findUserByEmail(email) {
  // Recorre las páginas de usuarios buscando el email.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) return found;
    if (data.users.length < 200) break;
  }
  return null;
}

async function main() {
  console.log("\nCreando / actualizando usuarios del tablero…\n");
  for (const u of USERS) {
    const email = emailFor(u.username);
    const meta = { name: u.name, username: u.username };
    try {
      const existing = await findUserByEmail(email);
      if (existing) {
        const { error } = await supabase.auth.admin.updateUserById(
          existing.id,
          { password: u.password, user_metadata: meta, email_confirm: true }
        );
        if (error) throw error;
        console.log(`↻ Actualizado  ${u.name}  (usuario: ${u.username})`);
      } else {
        const { error } = await supabase.auth.admin.createUser({
          email,
          password: u.password,
          email_confirm: true,
          user_metadata: meta,
        });
        if (error) throw error;
        console.log(`✓ Creado       ${u.name}  (usuario: ${u.username})`);
      }
    } catch (err) {
      console.error(`✖ Error con ${u.username}:`, err.message);
    }
  }

  console.log("\n─────────────────────────────────────────────");
  console.log("Credenciales (entregar a cada persona):\n");
  for (const u of USERS) {
    console.log(`  ${u.name}`);
    console.log(`    usuario:    ${u.username}`);
    console.log(`    contraseña: ${u.password}\n`);
  }
  console.log("─────────────────────────────────────────────\n");
}

main();
