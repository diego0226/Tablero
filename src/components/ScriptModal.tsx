"use client";

import { useEffect, useRef, useState } from "react";
import type { ProspectScript } from "@/lib/types";

export type ScriptDraft = { title: string; body: string };

// Guion de objeción global: se usa igual para todas las fichas, con {{N}} como
// hueco para el nombre del negocio.
export default function ScriptModal({
  initial,
  saving,
  onClose,
  onSave,
  onDelete,
}: {
  initial: ProspectScript | null;
  saving: boolean;
  onClose: () => void;
  onSave: (draft: ScriptDraft) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState<ScriptDraft>(() => ({
    title: initial?.title ?? "",
    body: initial?.body ?? "",
  }));
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => titleRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function submit() {
    if (!draft.title.trim() || !draft.body.trim()) {
      titleRef.current?.focus();
      return;
    }
    onSave(draft);
  }

  return (
    <div
      className="overlay show"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="script-modal-title"
      >
        <h3 id="script-modal-title">
          {initial ? "Editar guion" : "Nuevo guion"}
        </h3>

        <div className="field">
          <label htmlFor="s-title">Cuándo se usa</label>
          <input
            id="s-title"
            ref={titleRef}
            value={draft.title}
            placeholder='Si dice "es muy caro"'
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </div>

        <div className="field">
          <label htmlFor="s-body">
            Texto <span className="sub-count">{"{{N}}"} = nombre del negocio</span>
          </label>
          <textarea
            id="s-body"
            rows={10}
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          />
        </div>

        <div className="modal-foot">
          {initial ? (
            <button className="link-danger" onClick={onDelete}>
              Eliminar guion
            </button>
          ) : (
            <span />
          )}
          <div className="right">
            <button className="btn" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={submit} disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
