// Constantes y utilidades de la vista de prospección.
import type {
  Prospect,
  ProspectLink,
  ProspectPriority,
  ProspectStatus,
} from "./types";

export const PROSPECT_STATUSES: ProspectStatus[] = [
  "pendiente",
  "contactado",
  "respondió",
  "agendado",
  "no contactar",
];

// Etiqueta visible y color del borde de la ficha. El color es la única señal
// que se lee de un vistazo cuando la lista es larga.
export const STATUS_META: Record<
  ProspectStatus,
  { label: string; color: string }
> = {
  pendiente: { label: "Pendiente", color: "var(--st-pendiente)" },
  contactado: { label: "Contactado", color: "var(--st-contactado)" },
  "respondió": { label: "Respondió", color: "var(--st-respondio)" },
  agendado: { label: "Agendado", color: "var(--st-agendado)" },
  "no contactar": { label: "No contactar", color: "var(--st-nocontactar)" },
};

// Clase CSS por estado: los valores llevan tilde y espacio, así que no sirven
// como sufijo de clase tal cual.
export const STATUS_CLASS: Record<ProspectStatus, string> = {
  pendiente: "st-pendiente",
  contactado: "st-contactado",
  "respondió": "st-respondio",
  agendado: "st-agendado",
  "no contactar": "st-nocontactar",
};

export const isProspectStatus = (v: unknown): v is ProspectStatus =>
  typeof v === "string" && (PROSPECT_STATUSES as string[]).includes(v);

export const PROSPECT_PRIORITIES: ProspectPriority[] = ["A", "B", "C"];

// Largo máximo por canal. Pasarse no bloquea el envío, pero un DM largo se
// lee como plantilla: el contador avisa antes de mandarlo.
export const MSG_LIMITS = { ig: 350, wa: 500, followup: 500 } as const;

// Fichas ya cerradas: se atenúan en la lista para que no distraigan.
export const isClosed = (s: ProspectStatus) =>
  s === "agendado" || s === "no contactar";

// {{N}} → nombre del negocio (guiones globales).
export const fillTemplate = (body: string, name: string) =>
  body.replace(/\{\{N\}\}/g, name);

export function waLink(whatsapp: string, text: string): string {
  return `https://wa.me/${whatsapp}?text=${encodeURIComponent(text)}`;
}

export function telLink(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

// Orden de la lista: el de la investigación (A primero), y a igualdad, por
// puntaje descendente.
export function byProspectOrder(a: Prospect, b: Prospect): number {
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return b.score - a.score;
}

// Texto sobre el que busca la barra: nombre, rubro, zona, segmento y canal.
export function searchIndex(p: Prospect): string {
  return [p.name, p.kind, p.zone, p.segment, p.channel, p.notes]
    .join(" ")
    .toLowerCase();
}

// Identificador estable a partir del nombre, sin tildes ni signos.
export function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // marcas diacríticas sueltas tras NFD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || `ficha-${Date.now().toString(36)}`;
}

/* ──────────────────────── fichas que llegan por Realtime ────────────────────
 * Postgres guarda fuera de línea (TOAST) las columnas grandes de una fila que
 * pasa de ~2 KB — que es el caso de casi todas las fichas, por los tres
 * mensajes. Cuando se actualiza solo `status`, esas columnas no se vuelven a
 * escribir, así que el WAL no las repite y Realtime las manda en `null`.
 *
 * Por eso una ficha que llega por Realtime NO es una ficha completa: hay que
 * fusionarla sobre la que ya está en pantalla y, si vino recortada, pedir la
 * fila entera. Antes se reemplazaba tal cual y la vista reventaba al leer
 * `signals.length` o `links.map` de un `null`.
 * ------------------------------------------------------------------------- */

// Campos `not null` en la base: si llegan vacíos, el payload viene recortado.
const REQUIRED_FIELDS = [
  "slug", "name", "kind", "segment", "zone", "phone", "links", "score",
  "priority", "appointment_fit", "signals", "unverified", "pain", "angle",
  "channel", "channel_note", "personalization", "avoid", "msg_ig", "msg_wa",
  "msg_followup", "next_step", "status", "notes", "sort_order",
] as const satisfies readonly (keyof Prospect)[];

const EMPTY: Prospect = {
  id: "", slug: "", name: "", kind: "", segment: "", zone: "", phone: "",
  whatsapp: null, links: [], score: 0, priority: "C", appointment_fit: "",
  signals: [], unverified: [], pain: "", angle: "", channel: "",
  channel_note: "", personalization: "", avoid: "", msg_ig: "", msg_wa: "",
  msg_followup: "", next_step: "", status: "pendiente", notes: "",
  status_changed_at: null, sort_order: 0,
};

const text = (v: unknown, fallback: string) =>
  typeof v === "string" ? v : fallback;

const strings = (v: unknown, fallback: string[]) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : fallback;

const links = (v: unknown, fallback: ProspectLink[]): ProspectLink[] =>
  Array.isArray(v)
    ? v
        .filter((l): l is ProspectLink =>
          !!l && typeof l === "object" &&
          typeof (l as ProspectLink).url === "string"
        )
        .map((l) => ({ label: text(l.label, l.url), url: l.url }))
    : fallback;

const number = (v: unknown, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

// ¿El payload trae menos de lo que debería? (columnas TOAST no reenviadas)
export function isPartialProspect(row: Partial<Prospect>): boolean {
  return REQUIRED_FIELDS.some((k) => row[k] === null || row[k] === undefined);
}

// Deja siempre una ficha con todos los campos del tipo correcto. Lo que venga
// vacío se completa con `prev` (la ficha que ya estaba en pantalla).
export function normalizeProspect(
  row: Partial<Prospect>,
  prev?: Prospect
): Prospect {
  const base = prev ?? EMPTY;
  return {
    id: text(row.id, base.id),
    slug: text(row.slug, base.slug),
    name: text(row.name, base.name),
    kind: text(row.kind, base.kind),
    segment: text(row.segment, base.segment),
    zone: text(row.zone, base.zone),
    phone: text(row.phone, base.phone),
    // `whatsapp` sí admite null en la base: null es un valor, no un hueco.
    whatsapp: row.whatsapp === undefined ? base.whatsapp : row.whatsapp,
    links: links(row.links, base.links),
    score: number(row.score, base.score),
    priority: (PROSPECT_PRIORITIES as string[]).includes(row.priority as string)
      ? (row.priority as ProspectPriority)
      : base.priority,
    appointment_fit: text(row.appointment_fit, base.appointment_fit),
    signals: strings(row.signals, base.signals),
    unverified: strings(row.unverified, base.unverified),
    pain: text(row.pain, base.pain),
    angle: text(row.angle, base.angle),
    channel: text(row.channel, base.channel),
    channel_note: text(row.channel_note, base.channel_note),
    personalization: text(row.personalization, base.personalization),
    avoid: text(row.avoid, base.avoid),
    msg_ig: text(row.msg_ig, base.msg_ig),
    msg_wa: text(row.msg_wa, base.msg_wa),
    msg_followup: text(row.msg_followup, base.msg_followup),
    next_step: text(row.next_step, base.next_step),
    status: isProspectStatus(row.status) ? row.status : base.status,
    notes: text(row.notes, base.notes),
    status_changed_at:
      row.status_changed_at === undefined
        ? base.status_changed_at
        : row.status_changed_at,
    sort_order: number(row.sort_order, base.sort_order),
    created_by: row.created_by ?? base.created_by,
    updated_by: row.updated_by ?? base.updated_by,
  };
}

// Evita chocar con un slug ya usado (el índice único de la tabla).
export function uniqueSlug(name: string, taken: Set<string>): string {
  const base = slugify(name);
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}
