"use client";

import {
  MSG_LIMITS,
  PROSPECT_STATUSES,
  fillTemplate,
  isClosed,
  telLink,
  waLink,
} from "@/lib/prospects";
import type { Prospect, ProspectScript, ProspectStatus } from "@/lib/types";

export type NotesState = "idle" | "saving" | "saved";

// Un mensaje listo para enviar, con su contador de caracteres. El contador se
// pone en rojo al pasarse del largo cómodo del canal: no bloquea, avisa.
function MessageBox({
  label,
  text,
  limit,
  onCopy,
  extra,
}: {
  label: string;
  text: string;
  limit: number;
  onCopy: () => void;
  extra?: React.ReactNode;
}) {
  const over = text.length > limit;
  return (
    <div className="msg">
      <div className="msg-head">
        <span>{label}</span>
        <span className={`msg-count ${over ? "over" : ""}`}>
          {text.length}/{limit}
        </span>
      </div>
      <div className="msg-body">{text}</div>
      <div className="msg-acts">
        <button className="btn btn-primary" onClick={onCopy}>
          Copiar
        </button>
        {extra}
      </div>
    </div>
  );
}

export default function ProspectCard({
  p,
  scripts,
  notesState,
  onEdit,
  onCopy,
  onStatus,
  onNotes,
}: {
  p: Prospect;
  scripts: ProspectScript[];
  notesState: NotesState;
  onEdit: () => void;
  // `initial` marca los mensajes de primer contacto: al copiarlos se ofrece
  // pasar la ficha a "contactado".
  onCopy: (text: string, kind?: "initial" | "other") => void;
  onStatus: (status: ProspectStatus) => void;
  onNotes: (notes: string) => void;
}) {
  const meta = [p.kind, p.zone, p.phone].filter(Boolean).join(" · ");

  return (
    <article className={`pros-card ${isClosed(p.status) ? "closed" : ""}`}>
      <div className="pros-head">
        <div className="pros-ident">
          <h3 className="pros-name">{p.name}</h3>
          <p className="pros-meta">{meta}</p>
        </div>
        <div className="pros-badges">
          <span className="pros-score" title="Puntaje de calificación">
            {p.score}
          </span>
          <span className={`pros-tag pri-${p.priority}`}>{p.priority}</span>
          <button
            type="button"
            className="btn btn-icon"
            onClick={onEdit}
            aria-label={`Editar ficha de ${p.name}`}
            title="Editar ficha"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
        </div>
      </div>

      {(p.signals.length > 0 || p.unverified.length > 0) && (
        <ul className="pros-signals">
          {p.signals.map((s, i) => (
            <li key={`v${i}`}>{s}</li>
          ))}
          {p.unverified.map((s, i) => (
            <li key={`q${i}`} className="q">
              Sin verificar: {s}
            </li>
          ))}
        </ul>
      )}

      <div className="pros-grid">
        <div className="f">
          <span className="k">Probabilidad de trabajar con citas</span>
          {p.appointment_fit}
        </div>
        <div className="f">
          <span className="k">Dolor principal probable</span>
          {p.pain}
        </div>
        <div className="f">
          <span className="k">Ángulo de contacto</span>
          {p.angle}
        </div>
        <div className="f">
          <span className="k">Canal recomendado</span>
          <b>{p.channel}</b>
          {p.channel_note ? ` — ${p.channel_note}` : ""}
        </div>
        <div className="f">
          <span className="k">Dato para personalizar</span>
          {p.personalization}
        </div>
      </div>

      {p.avoid && (
        <div className="pros-warn">
          <span className="k">Qué NO decir</span>
          {p.avoid}
        </div>
      )}

      <MessageBox
        label="Mensaje inicial · Instagram"
        text={p.msg_ig}
        limit={MSG_LIMITS.ig}
        onCopy={() => onCopy(p.msg_ig, "initial")}
      />
      <MessageBox
        label="Mensaje inicial · WhatsApp"
        text={p.msg_wa}
        limit={MSG_LIMITS.wa}
        onCopy={() => onCopy(p.msg_wa, "initial")}
        extra={
          p.whatsapp ? (
            <a
              className="btn"
              target="_blank"
              rel="noopener noreferrer"
              href={waLink(p.whatsapp, p.msg_wa)}
            >
              Abrir WhatsApp
            </a>
          ) : null
        }
      />
      <MessageBox
        label="Seguimiento a los 3 días"
        text={p.msg_followup}
        limit={MSG_LIMITS.followup}
        onCopy={() => onCopy(p.msg_followup)}
      />

      <details className="pros-details">
        <summary>Respuestas a objeciones y próximo paso</summary>
        <div className="pros-details-in">
          <div className="f">
            <span className="k">Próximo paso recomendado</span>
            {p.next_step}
          </div>
          {scripts.length > 0 && (
            <div className="pros-actions">
              {scripts.map((s) => (
                <button
                  key={s.id}
                  className="btn"
                  onClick={() => onCopy(fillTemplate(s.body, p.name))}
                >
                  {s.title}
                </button>
              ))}
            </div>
          )}
        </div>
      </details>

      <div className="pros-foot">
        {p.links.map((l) => (
          <a
            key={l.url}
            className="btn"
            target="_blank"
            rel="noopener noreferrer"
            href={l.url}
          >
            {l.label}
          </a>
        ))}
        {p.phone && (
          <a className="btn" href={telLink(p.phone)}>
            Llamar
          </a>
        )}
        <label className="pros-status">
          <span className="k">Estado</span>
          <select
            value={p.status}
            aria-label={`Estado de ${p.name}`}
            onChange={(e) => onStatus(e.target.value as ProspectStatus)}
          >
            {PROSPECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="pros-notes">
        <textarea
          value={p.notes}
          aria-label={`Notas de ${p.name}`}
          placeholder="Notas de la conversación…"
          onChange={(e) => onNotes(e.target.value)}
        />
        <span className={`pros-saved ${notesState}`}>
          {notesState === "saving"
            ? "Guardando…"
            : notesState === "saved"
              ? "Guardado"
              : ""}
        </span>
      </div>
    </article>
  );
}
