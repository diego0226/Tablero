// Carga las fichas de prospección y los guiones de objeción.
// Es idempotente: solo inserta las que falten (por `slug`) y nunca pisa lo que
// el equipo ya editó en la app —estado, notas o textos—.
// Uso:  npm run seed:prospects
import "./_env.mjs";
import { requireEnv } from "./_env.mjs";
import { createClient } from "@supabase/supabase-js";

// La semilla no se versiona: lleva la lista de negocios con sus teléfonos y los
// precios, y este repositorio es público (ver .gitignore).
let PROSPECTS, PROSPECT_SCRIPTS;
try {
  ({ PROSPECTS, PROSPECT_SCRIPTS } = await import("./seed-data-prospects.mjs"));
} catch {
  console.error(
    "\n✖ Falta scripts/seed-data-prospects.mjs (no se versiona a propósito)." +
      "\n  Pedíselo a alguien del equipo o exportá las fichas desde la app.\n"
  );
  process.exit(1);
}

const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function seed(table, rows, label) {
  const { data: existing, error: readErr } = await supabase
    .from(table)
    .select("slug");

  if (readErr) {
    console.error(`✖ No se pudo leer la tabla \`${table}\`:`, readErr.message);
    console.error("  ¿Ejecutaste supabase/migrations/0007_prospects.sql?");
    process.exit(1);
  }

  const have = new Set((existing ?? []).map((r) => r.slug));
  const missing = rows.filter((r) => !have.has(r.slug));

  if (missing.length === 0) {
    console.log(`ℹ ${label}: las ${rows.length} ya estaban cargadas, no se toca nada.`);
    return;
  }

  const { error } = await supabase.from(table).insert(missing);
  if (error) {
    console.error(`✖ Error insertando en \`${table}\`:`, error.message);
    process.exit(1);
  }
  console.log(
    `✓ ${label}: ${missing.length} insertadas` +
      (have.size ? ` (${have.size} ya existían y se dejaron intactas).` : ".")
  );
}

async function main() {
  await seed("prospect_scripts", PROSPECT_SCRIPTS, "Guiones");
  await seed("prospects", PROSPECTS, "Fichas");
}

main();
