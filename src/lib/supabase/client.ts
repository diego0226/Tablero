import { createBrowserClient } from "@supabase/ssr";

// Cliente de Supabase para el navegador (componentes "use client").
// Usa la sesión guardada en cookies por el middleware.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
