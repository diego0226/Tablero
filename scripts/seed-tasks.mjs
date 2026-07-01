// Carga las tareas iniciales en la tabla `tasks`.
// Solo inserta si la tabla está vacía (para no pisar cambios del equipo).
// Uso:  npm run seed:tasks
import "./_env.mjs";
import { requireEnv } from "./_env.mjs";
import { createClient } from "@supabase/supabase-js";
import { SEED } from "./seed-data.mjs";

const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { count, error: countErr } = await supabase
    .from("tasks")
    .select("*", { count: "exact", head: true });

  if (countErr) {
    console.error("✖ No se pudo leer la tabla `tasks`:", countErr.message);
    console.error("  ¿Ejecutaste la migración supabase/migrations/0001_init.sql?");
    process.exit(1);
  }

  if ((count ?? 0) > 0) {
    console.log(
      `ℹ La tabla ya tiene ${count} tareas. No se inserta nada para no pisar cambios.`
    );
    return;
  }

  const rows = SEED.map((t, i) => ({
    code: t.code,
    ep: t.ep,
    prio: t.prio,
    status: t.status,
    title: t.title,
    description: t.description ?? "",
    assignee: "",
    subtasks: t.subtasks ?? [],
    sort_order: i + 1, // > 0: el trigger 0004 respeta el orden explícito del seed
  }));

  const { error } = await supabase.from("tasks").insert(rows);
  if (error) {
    console.error("✖ Error insertando tareas:", error.message);
    process.exit(1);
  }
  console.log(`✓ ${rows.length} tareas insertadas en el tablero.`);
}

main();
