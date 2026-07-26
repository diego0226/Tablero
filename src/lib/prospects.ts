// Constantes y utilidades de la vista de prospección.
import type { Prospect, ProspectPriority, ProspectStatus } from "./types";

export const PROSPECT_STATUSES: ProspectStatus[] = [
  "pendiente",
  "contactado",
  "respondió",
  "agendado",
  "no contactar",
];

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
