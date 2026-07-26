"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { colorForName } from "@/lib/users";

const TABS = [
  { href: "/", label: "Tablero" },
  { href: "/prospeccion", label: "Prospección" },
];

function initials(name: string): string {
  if (!name) return "";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

// Cabecera común de las dos vistas: marca, pestañas, sesión y acciones propias
// de cada página (`actions`). Debajo se pinta lo que reciba como `children`
// —la barra de progreso del tablero o las estadísticas de prospección—.
export default function AppHeader({
  currentUserName,
  title,
  subtitle,
  actions,
  children,
}: {
  currentUserName: string;
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const pathname = usePathname();

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header>
      <div className="head-row">
        <div className="title-wrap">
          <div className="mark">R</div>
          <div>
            <h1>{title}</h1>
            <div className="sub">{subtitle}</div>
          </div>
        </div>
        <div className="actions">
          <div className="who">
            <span
              className="me"
              style={{ background: colorForName(currentUserName) }}
              title={currentUserName}
            >
              {initials(currentUserName)}
            </span>
            <span>
              <b>{currentUserName}</b>
            </span>
          </div>
          {actions}
          <button className="btn" onClick={signOut}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            Salir
          </button>
        </div>
      </div>

      <nav className="tabs" aria-label="Secciones">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`tab ${pathname === t.href ? "on" : ""}`}
            aria-current={pathname === t.href ? "page" : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {children}
    </header>
  );
}
