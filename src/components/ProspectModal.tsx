"use client";

import { useEffect, useRef, useState } from "react";
import { MSG_LIMITS, PROSPECT_PRIORITIES } from "@/lib/prospects";
import type { Prospect, ProspectLink, ProspectPriority } from "@/lib/types";

// Todo lo editable de una ficha. El estado y las notas se manejan en la
// tarjeta, no aquí: son trabajo del día a día, no datos de la investigación.
export type ProspectDraft = {
  name: string;
  kind: string;
  segment: string;
  zone: string;
  phone: string;
  whatsapp: string;
  priority: ProspectPriority;
  score: number;
  appointment_fit: string;
  signals: string[];
  unverified: string[];
  links: ProspectLink[];
  pain: string;
  angle: string;
  channel: string;
  channel_note: string;
  personalization: string;
  avoid: string;
  msg_ig: string;
  msg_wa: string;
  msg_followup: string;
  next_step: string;
};

export const emptyDraft = (): ProspectDraft => ({
  name: "",
  kind: "",
  segment: "",
  zone: "",
  phone: "",
  whatsapp: "",
  priority: "B",
  score: 0,
  appointment_fit: "",
  signals: [],
  unverified: [],
  links: [],
  pain: "",
  angle: "",
  channel: "",
  channel_note: "",
  personalization: "",
  avoid: "",
  msg_ig: "",
  msg_wa: "",
  msg_followup: "",
  next_step: "",
});

export const draftFrom = (p: Prospect): ProspectDraft => ({
  name: p.name,
  kind: p.kind,
  segment: p.segment,
  zone: p.zone,
  phone: p.phone,
  whatsapp: p.whatsapp ?? "",
  priority: p.priority,
  score: p.score,
  appointment_fit: p.appointment_fit,
  signals: [...p.signals],
  unverified: [...p.unverified],
  links: p.links.map((l) => ({ ...l })),
  pain: p.pain,
  angle: p.angle,
  channel: p.channel,
  channel_note: p.channel_note,
  personalization: p.personalization,
  avoid: p.avoid,
  msg_ig: p.msg_ig,
  msg_wa: p.msg_wa,
  msg_followup: p.msg_followup,
  next_step: p.next_step,
});

/* --------------------------------------------------------- sub-editores */

function ListEditor({
  label,
  hint,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
}) {
  const [value, setValue] = useState("");
  const add = () => {
    const v = value.trim();
    if (!v) return;
    onChange([...items, v]);
    setValue("");
  };
  return (
    <div className="field">
      <label>
        {label} {hint && <span className="sub-count">{hint}</span>}
      </label>
      <div className="sub-list">
        {items.length === 0 ? (
          <div className="empty" style={{ padding: "8px 0" }}>
            Nada todavía
          </div>
        ) : (
          items.map((s, i) => (
            <div key={i} className="sub-item">
              <span>{s}</span>
              <button
                type="button"
                aria-label={`Quitar: ${s}`}
                onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
      <div className="sub-add">
        <input
          value={value}
          placeholder={placeholder}
          aria-label={label}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn" onClick={add}>
          Añadir
        </button>
      </div>
    </div>
  );
}

function LinksEditor({
  links,
  onChange,
}: {
  links: ProspectLink[];
  onChange: (links: ProspectLink[]) => void;
}) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const add = () => {
    const l = label.trim();
    const u = url.trim();
    if (!l || !u) return;
    onChange([...links, { label: l, url: u }]);
    setLabel("");
    setUrl("");
  };
  return (
    <div className="field">
      <label>Enlaces</label>
      <div className="sub-list">
        {links.length === 0 ? (
          <div className="empty" style={{ padding: "8px 0" }}>
            Sin enlaces
          </div>
        ) : (
          links.map((l, i) => (
            <div key={i} className="sub-item">
              <span>
                <b>{l.label}</b> — {l.url}
              </span>
              <button
                type="button"
                aria-label={`Quitar enlace ${l.label}`}
                onClick={() => onChange(links.filter((_, idx) => idx !== i))}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
      <div className="sub-add">
        <input
          style={{ maxWidth: 130 }}
          value={label}
          placeholder="Maps"
          aria-label="Nombre del enlace"
          onChange={(e) => setLabel(e.target.value)}
        />
        <input
          value={url}
          placeholder="https://…"
          aria-label="Dirección del enlace"
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn" onClick={add}>
          Añadir
        </button>
      </div>
    </div>
  );
}

function MessageField({
  id,
  label,
  value,
  limit,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  limit: number;
  onChange: (v: string) => void;
}) {
  const over = value.length > limit;
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}{" "}
        <span className={`sub-count ${over ? "over" : ""}`}>
          {value.length}/{limit}
        </span>
      </label>
      <textarea
        id={id}
        rows={5}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/* -------------------------------------------------------------- modal */

export default function ProspectModal({
  initial,
  saving,
  onClose,
  onSave,
  onDelete,
}: {
  initial: Prospect | null;
  saving: boolean;
  onClose: () => void;
  onSave: (draft: ProspectDraft) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState<ProspectDraft>(() =>
    initial ? draftFrom(initial) : emptyDraft()
  );
  const nameRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const set = <K extends keyof ProspectDraft>(k: K, v: ProspectDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  useEffect(() => {
    const t = window.setTimeout(() => nameRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Trampa de foco básica dentro del modal (accesibilidad).
  function onModalKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Tab" || !modalRef.current) return;
    const focusables = modalRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function submit() {
    if (!draft.name.trim()) {
      nameRef.current?.focus();
      return;
    }
    onSave({
      ...draft,
      name: draft.name.trim(),
      // WhatsApp en formato internacional sin '+': lo que espera wa.me.
      whatsapp: draft.whatsapp.replace(/\D/g, ""),
    });
  }

  return (
    <div
      className="overlay show"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal modal-wide"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pros-modal-title"
        onKeyDown={onModalKeyDown}
      >
        <h3 id="pros-modal-title">
          {initial ? `Editar ${initial.name}` : "Nueva ficha"}
        </h3>

        <div className="field">
          <label htmlFor="p-name">Negocio</label>
          <input
            id="p-name"
            ref={nameRef}
            value={draft.name}
            placeholder="Nombre tal como aparece en Maps"
            onChange={(e) => set("name", e.target.value)}
          />
        </div>

        <div className="row2">
          <div className="field">
            <label htmlFor="p-kind">Rubro</label>
            <input
              id="p-kind"
              value={draft.kind}
              placeholder="Barbería, salón de belleza…"
              onChange={(e) => set("kind", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="p-segment">Segmento</label>
            <input
              id="p-segment"
              value={draft.segment}
              placeholder="Belleza, Salud, Uñas…"
              onChange={(e) => set("segment", e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="p-zone">Zona</label>
          <input
            id="p-zone"
            value={draft.zone}
            placeholder="Señas exactas: 75 m este de Correos…"
            onChange={(e) => set("zone", e.target.value)}
          />
        </div>

        <div className="row2">
          <div className="field">
            <label htmlFor="p-phone">Teléfono</label>
            <input
              id="p-phone"
              value={draft.phone}
              placeholder="8888 8888"
              onChange={(e) => set("phone", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="p-wa">
              WhatsApp <span className="sub-count">con código país, sin +</span>
            </label>
            <input
              id="p-wa"
              inputMode="numeric"
              value={draft.whatsapp}
              placeholder="50688888888"
              onChange={(e) => set("whatsapp", e.target.value)}
            />
          </div>
        </div>

        <div className="row2">
          <div className="field">
            <label htmlFor="p-priority">Prioridad</label>
            <select
              id="p-priority"
              value={draft.priority}
              onChange={(e) =>
                set("priority", e.target.value as ProspectPriority)
              }
            >
              {PROSPECT_PRIORITIES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="p-score">
              Puntaje <span className="sub-count">A ≥ 70 · B 45–69 · C &lt; 45</span>
            </label>
            <input
              id="p-score"
              type="number"
              min={0}
              max={200}
              value={draft.score}
              onChange={(e) =>
                set("score", Math.max(0, Math.min(200, Number(e.target.value) || 0)))
              }
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="p-fit">Probabilidad de trabajar con citas</label>
          <input
            id="p-fit"
            value={draft.appointment_fit}
            placeholder="Total — fisioterapia es 100% por cita"
            onChange={(e) => set("appointment_fit", e.target.value)}
          />
        </div>

        <ListEditor
          label="Señales verificadas"
          hint="solo lo que cualquiera pueda comprobar desde afuera"
          items={draft.signals}
          onChange={(v) => set("signals", v)}
          placeholder="4,7 en Google con 49 reseñas"
        />
        <ListEditor
          label="Sin verificar"
          hint="no puede aparecer en ningún mensaje"
          items={draft.unverified}
          onChange={(v) => set("unverified", v)}
          placeholder="Cuántas personas atienden"
        />
        <LinksEditor links={draft.links} onChange={(v) => set("links", v)} />

        <div className="field">
          <label htmlFor="p-pain">Dolor principal probable</label>
          <textarea
            id="p-pain"
            value={draft.pain}
            onChange={(e) => set("pain", e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="p-angle">Ángulo de contacto</label>
          <textarea
            id="p-angle"
            value={draft.angle}
            onChange={(e) => set("angle", e.target.value)}
          />
        </div>

        <div className="row2">
          <div className="field">
            <label htmlFor="p-channel">Canal recomendado</label>
            <input
              id="p-channel"
              value={draft.channel}
              placeholder="WhatsApp / Instagram DM"
              onChange={(e) => set("channel", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="p-channel-note">Advertencia del canal</label>
            <input
              id="p-channel-note"
              value={draft.channel_note}
              placeholder="El 2494 es fijo: no asumas WhatsApp"
              onChange={(e) => set("channel_note", e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="p-pers">Dato para personalizar</label>
          <textarea
            id="p-pers"
            value={draft.personalization}
            onChange={(e) => set("personalization", e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="p-avoid">Qué NO decir</label>
          <textarea
            id="p-avoid"
            value={draft.avoid}
            onChange={(e) => set("avoid", e.target.value)}
          />
        </div>

        <MessageField
          id="p-ig"
          label="Mensaje inicial · Instagram"
          value={draft.msg_ig}
          limit={MSG_LIMITS.ig}
          onChange={(v) => set("msg_ig", v)}
        />
        <MessageField
          id="p-wa-msg"
          label="Mensaje inicial · WhatsApp"
          value={draft.msg_wa}
          limit={MSG_LIMITS.wa}
          onChange={(v) => set("msg_wa", v)}
        />
        <MessageField
          id="p-follow"
          label="Seguimiento a los 3 días"
          value={draft.msg_followup}
          limit={MSG_LIMITS.followup}
          onChange={(v) => set("msg_followup", v)}
        />

        <div className="field">
          <label htmlFor="p-next">Próximo paso recomendado</label>
          <textarea
            id="p-next"
            value={draft.next_step}
            onChange={(e) => set("next_step", e.target.value)}
          />
        </div>

        <div className="modal-foot">
          {initial ? (
            <button className="link-danger" onClick={onDelete}>
              Eliminar ficha
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
