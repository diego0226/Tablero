"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { emailForUsername, USERS } from "@/lib/users";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError("Escribe tu usuario y contraseña.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: emailForUsername(username),
      password,
    });
    if (error) {
      setError("Usuario o contraseña incorrectos.");
      setLoading(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          <div className="mark">N</div>
          <div>
            <strong style={{ fontFamily: "var(--serif)", fontSize: 16 }}>
              Tablero · Navaja
            </strong>
            <div className="sub">Control del proyecto</div>
          </div>
        </div>

        <h2>Iniciar sesión</h2>
        <p className="hint">Acceso solo para el equipo.</p>

        <form onSubmit={handleSubmit}>
          {error && <div className="login-error">{error}</div>}
          <div className="field">
            <label htmlFor="username">Usuario</label>
            <input
              id="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="diego"
            />
          </div>
          <div className="field">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <div className="login-users">
          Usuarios del equipo:{" "}
          {USERS.map((u, i) => (
            <span key={u.username}>
              {i > 0 ? " · " : ""}
              <b>{u.username}</b>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
