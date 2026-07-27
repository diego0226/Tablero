"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import AppHeader from "@/components/AppHeader";
import ProspectCard, { type NotesState } from "@/components/ProspectCard";
import ProspectModal, { type ProspectDraft } from "@/components/ProspectModal";
import ScriptModal, { type ScriptDraft } from "@/components/ScriptModal";
import { ToastStack, useToasts } from "@/components/Toasts";
import {
  ContactRules,
  NeverSay,
  PitchBlock,
  QualifyingQuestions,
  ScoringTable,
} from "@/components/ProspectDoctrine";
import {
  PROSPECT_STATUSES,
  STATUS_META,
  byProspectOrder,
  fillTemplate,
  isPartialProspect,
  normalizeProspect,
  searchIndex,
  uniqueSlug,
} from "@/lib/prospects";
import type { Prospect, ProspectScript, ProspectStatus } from "@/lib/types";

type PriorityFilter = "all" | "A" | "B" | "C";
type StatusFilter = "all" | ProspectStatus;

const FILTERS: { id: PriorityFilter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "A", label: "Prioridad A" },
  { id: "B", label: "Prioridad B" },
  { id: "C", label: "Prioridad C" },
];

// Placeholder de carga: mismo esqueleto que una ficha real para que la lista
// no salte al llegar los datos.
function CardSkeleton() {
  return (
    <div className="pros-card sk-card" aria-hidden="true">
      <div className="sk-row">
        <div className="sk-col">
          <span className="sk sk-line w60" style={{ height: 17 }} />
          <span className="sk sk-line w40" />
        </div>
        <span className="sk" style={{ width: 58, height: 26 }} />
      </div>
      <div className="sk-col" style={{ marginTop: 16 }}>
        <span className="sk sk-line w90" />
        <span className="sk sk-line w75" />
      </div>
      <div className="sk-grid">
        <span className="sk" style={{ height: 40 }} />
        <span className="sk" style={{ height: 40 }} />
      </div>
      <span className="sk" style={{ height: 86, marginTop: 14, display: "block" }} />
      <div className="sk-row" style={{ marginTop: 14 }}>
        <span className="sk" style={{ width: 84, height: 30 }} />
        <span className="sk" style={{ width: 148, height: 30 }} />
      </div>
    </div>
  );
}

// Portapapeles con plan B: en navegadores viejos o contextos sin permiso,
// `navigator.clipboard` no existe o falla en silencio.
async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* seguimos con el plan B */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export default function Prospects({
  currentUserName,
}: {
  currentUserName: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { toasts, push, dismiss } = useToasts();

  const [prospects, setProspects] = useState<Prospect[]>([]);
  const prospectsRef = useRef<Prospect[]>([]);
  useEffect(() => {
    prospectsRef.current = prospects;
  }, [prospects]);

  const [scripts, setScripts] = useState<ProspectScript[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [filter, setFilter] = useState<PriorityFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [segment, setSegment] = useState("all");
  const [query, setQuery] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Prospect | null>(null);
  const [scriptEditing, setScriptEditing] = useState<ProspectScript | null>(null);
  const [scriptOpen, setScriptOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Notas: se escriben seguido, así que se guardan con retardo y se avisa del
  // resultado sin interrumpir.
  const notesTimers = useRef(new Map<string, number>());
  const notesPending = useRef(new Map<string, string>());
  const [notesState, setNotesState] = useState<Record<string, NotesState>>({});

  /* ---------------------------------------------------------------- datos */
  // Toda ficha entra por acá: se normaliza y se fusiona sobre la que ya está
  // en pantalla, nunca la reemplaza a ciegas (ver `normalizeProspect`).
  // Cuándo se recibió por última vez una fila entera de cada ficha. Sirve para
  // no volver a pedirla si el eco de Realtime llega justo después.
  const freshAt = useRef(new Map<string, number>());

  const upsertLocal = useCallback((row: Partial<Prospect>) => {
    if (typeof row?.id !== "string" || !row.id) return;
    const id = row.id;
    if (!isPartialProspect(row)) freshAt.current.set(id, Date.now());
    setProspects((prev) => {
      const i = prev.findIndex((p) => p.id === id);
      const merged = normalizeProspect(row, i === -1 ? undefined : prev[i]);
      // Si hay notas sin guardar en esta ficha, no las pisamos con lo remoto.
      const local = notesPending.current.get(id);
      const next = local === undefined ? merged : { ...merged, notes: local };
      if (i === -1) return [...prev, next];
      const copy = prev.slice();
      copy[i] = next;
      return copy;
    });
  }, []);

  const removeLocal = useCallback((id: string) => {
    setProspects((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // Realtime manda la fila recortada cuando solo cambió un campo pequeño: los
  // textos largos viajan en `null`. La fusión evita el hueco, pero si otro del
  // equipo editó justo esos textos nos quedaríamos con la versión vieja, así
  // que pedimos la fila completa. Una petición por ficha a la vez.
  const refetching = useRef(new Set<string>());
  const refetchOne = useCallback(
    async (id: string) => {
      if (refetching.current.has(id)) return;
      refetching.current.add(id);
      const { data } = await supabase
        .from("prospects")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      refetching.current.delete(id);
      if (data) upsertLocal(data as Prospect);
    },
    [supabase, upsertLocal]
  );

  const applyRemote = useCallback(
    (row: Partial<Prospect>) => {
      if (typeof row?.id !== "string" || !row.id) return;
      const id = row.id;
      // El cambio propio ya trajo la fila entera en la respuesta del PATCH:
      // el eco de Realtime que llega detrás no necesita otra petición.
      const fresh = Date.now() - (freshAt.current.get(id) ?? 0) < 2000;
      upsertLocal(row);
      if (isPartialProspect(row) && !fresh) refetchOne(id);
    },
    [upsertLocal, refetchOne]
  );

  const load = useCallback(async () => {
    const [{ data: rows, error }, { data: scriptRows, error: scriptError }] =
      await Promise.all([
        supabase.from("prospects").select("*"),
        supabase.from("prospect_scripts").select("*"),
      ]);
    if (error || scriptError) {
      setLoadError(true);
    } else {
      setLoadError(false);
      setProspects(
        ((rows ?? []) as Partial<Prospect>[]).map((r) => normalizeProspect(r))
      );
      setScripts(
        ((scriptRows ?? []) as ProspectScript[]).sort(
          (a, b) => a.sort_order - b.sort_order
        )
      );
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("prospects-changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "prospects" },
        (p) => applyRemote(p.new as Partial<Prospect>)
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "prospects" },
        (p) => applyRemote(p.new as Partial<Prospect>)
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "prospects" },
        (p) => removeLocal((p.old as { id: string }).id)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "prospect_scripts" },
        () => {
          supabase
            .from("prospect_scripts")
            .select("*")
            .then(({ data }) => {
              if (data)
                setScripts(
                  (data as ProspectScript[]).sort(
                    (a, b) => a.sort_order - b.sort_order
                  )
                );
            });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, load, applyRemote, removeLocal]);

  // Al salir de la vista, lo que quedó en el temporizador se guarda igual.
  useEffect(() => {
    const timers = notesTimers.current;
    const pending = notesPending.current;
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      timers.clear();
      pending.forEach((notes, id) => {
        void supabase.from("prospects").update({ notes }).eq("id", id);
      });
      pending.clear();
    };
  }, [supabase]);

  /* --------------------------------------------------------------- estado */
  // Un contador por ficha: si se cambia el estado dos veces seguidas, la
  // respuesta de la primera llega tarde y no debe pisar a la segunda.
  const statusSeq = useRef(new Map<string, number>());
  const [statusSaving, setStatusSaving] = useState<Record<string, boolean>>({});

  const setStatus = useCallback(
    async (id: string, status: ProspectStatus) => {
      const before = prospectsRef.current.find((p) => p.id === id);
      if (!before || before.status === status) return;

      const seq = (statusSeq.current.get(id) ?? 0) + 1;
      statusSeq.current.set(id, seq);

      setProspects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status } : p))
      );
      setStatusSaving((s) => ({ ...s, [id]: true }));

      // `select()` devuelve la fila completa: es la versión buena del servidor
      // y evita depender del payload recortado de Realtime.
      const { data, error } = await supabase
        .from("prospects")
        .update({ status })
        .eq("id", id)
        .select()
        .maybeSingle();

      if (statusSeq.current.get(id) !== seq) return; // ya hay otro cambio en curso

      setStatusSaving((s) => {
        const next = { ...s };
        delete next[id];
        return next;
      });

      if (error) {
        // Se revierte solo esta ficha: un snapshot de toda la lista borraría
        // lo que se haya escrito en otras mientras tanto.
        setProspects((prev) =>
          prev.map((p) => (p.id === id ? { ...p, status: before.status } : p))
        );
        push(`No se pudo cambiar el estado de ${before.name}.`, {
          tone: "error",
          action: { label: "Reintentar", run: () => setStatus(id, status) },
        });
        return;
      }
      if (data) upsertLocal(data as Prospect);
    },
    [supabase, push, upsertLocal]
  );

  const saveNotes = useCallback(
    async (id: string, notes: string) => {
      setNotesState((s) => ({ ...s, [id]: "saving" }));
      const { error } = await supabase
        .from("prospects")
        .update({ notes })
        .eq("id", id);
      notesPending.current.delete(id);
      if (error) {
        setNotesState((s) => ({ ...s, [id]: "idle" }));
        push("No se pudieron guardar las notas.", { tone: "error" });
        return;
      }
      setNotesState((s) => ({ ...s, [id]: "saved" }));
      window.setTimeout(
        () =>
          setNotesState((s) =>
            s[id] === "saved" ? { ...s, [id]: "idle" } : s
          ),
        2000
      );
    },
    [supabase, push]
  );

  const onNotes = useCallback(
    (id: string, notes: string) => {
      setProspects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, notes } : p))
      );
      notesPending.current.set(id, notes);
      const timers = notesTimers.current;
      const running = timers.get(id);
      if (running) window.clearTimeout(running);
      timers.set(
        id,
        window.setTimeout(() => {
          timers.delete(id);
          saveNotes(id, notes);
        }, 700)
      );
    },
    [saveNotes]
  );

  const copyFor = useCallback(
    async (p: Prospect, text: string, kind?: "initial" | "other") => {
      const ok = await writeClipboard(text);
      if (!ok) {
        push("No se pudo copiar. Seleccioná el texto y copialo a mano.", {
          tone: "error",
        });
        return;
      }
      if (kind === "initial" && p.status === "pendiente") {
        push("Copiado. ¿Lo marco como contactado?", {
          action: {
            label: "Marcar contactado",
            run: () => setStatus(p.id, "contactado"),
          },
        });
        return;
      }
      push("Copiado.");
    },
    [push, setStatus]
  );

  /* ----------------------------------------------------------------- CRUD */
  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(p: Prospect) {
    setEditing(p);
    setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setSaving(false);
  }

  async function saveProspect(draft: ProspectDraft) {
    if (saving) return;
    setSaving(true);
    const payload = {
      name: draft.name,
      kind: draft.kind.trim(),
      segment: draft.segment.trim(),
      zone: draft.zone.trim(),
      phone: draft.phone.trim(),
      whatsapp: draft.whatsapp || null,
      links: draft.links,
      score: draft.score,
      priority: draft.priority,
      appointment_fit: draft.appointment_fit.trim(),
      signals: draft.signals,
      unverified: draft.unverified,
      pain: draft.pain.trim(),
      angle: draft.angle.trim(),
      channel: draft.channel.trim(),
      channel_note: draft.channel_note.trim(),
      personalization: draft.personalization.trim(),
      avoid: draft.avoid.trim(),
      msg_ig: draft.msg_ig.trim(),
      msg_wa: draft.msg_wa.trim(),
      msg_followup: draft.msg_followup.trim(),
      next_step: draft.next_step.trim(),
    };

    if (editing) {
      const snapshot = prospectsRef.current;
      setProspects((prev) =>
        prev.map((p) => (p.id === editing.id ? { ...p, ...payload } : p))
      );
      const { error } = await supabase
        .from("prospects")
        .update(payload)
        .eq("id", editing.id);
      if (error) {
        setProspects(snapshot);
        setSaving(false);
        push("No se pudo guardar la ficha.", { tone: "error" });
        return;
      }
    } else {
      const taken = new Set(prospectsRef.current.map((p) => p.slug));
      const { data, error } = await supabase
        .from("prospects")
        .insert({ ...payload, slug: uniqueSlug(payload.name, taken) })
        .select()
        .single();
      if (error) {
        setSaving(false);
        push("No se pudo crear la ficha.", { tone: "error" });
        return;
      }
      if (data) upsertLocal(data as Prospect);
    }
    closeModal();
  }

  async function deleteProspect() {
    if (!editing) return;
    if (!confirm(`¿Eliminar la ficha de ${editing.name}?`)) return;
    const snap = editing;
    removeLocal(snap.id);
    closeModal();
    const { error } = await supabase
      .from("prospects")
      .delete()
      .eq("id", snap.id);
    if (error) {
      upsertLocal(snap);
      push("No se pudo eliminar la ficha.", { tone: "error" });
      return;
    }
    push(`Ficha de ${snap.name} eliminada.`, {
      action: {
        label: "Deshacer",
        run: async () => {
          const { created_by, updated_by, ...row } = snap;
          const { error: e2 } = await supabase.from("prospects").insert(row);
          if (e2) push("No se pudo restaurar la ficha.", { tone: "error" });
          else upsertLocal(snap);
        },
      },
    });
  }

  async function saveScript(draft: ScriptDraft) {
    if (saving) return;
    setSaving(true);
    if (scriptEditing) {
      const { error } = await supabase
        .from("prospect_scripts")
        .update({ title: draft.title.trim(), body: draft.body })
        .eq("id", scriptEditing.id);
      if (error) {
        setSaving(false);
        push("No se pudo guardar el guion.", { tone: "error" });
        return;
      }
    } else {
      const taken = new Set(scripts.map((s) => s.slug));
      const next = Math.max(0, ...scripts.map((s) => s.sort_order)) + 1;
      const { error } = await supabase.from("prospect_scripts").insert({
        slug: uniqueSlug(draft.title, taken),
        title: draft.title.trim(),
        body: draft.body,
        sort_order: next,
      });
      if (error) {
        setSaving(false);
        push("No se pudo crear el guion.", { tone: "error" });
        return;
      }
    }
    await load();
    setScriptOpen(false);
    setScriptEditing(null);
    setSaving(false);
  }

  async function deleteScript() {
    if (!scriptEditing) return;
    if (!confirm(`¿Eliminar el guion “${scriptEditing.title}”?`)) return;
    const { error } = await supabase
      .from("prospect_scripts")
      .delete()
      .eq("id", scriptEditing.id);
    if (error) {
      push("No se pudo eliminar el guion.", { tone: "error" });
      return;
    }
    setScripts((prev) => prev.filter((s) => s.id !== scriptEditing.id));
    setScriptOpen(false);
    setScriptEditing(null);
  }

  /* ------------------------------------------------------------ derivados */
  const segments = useMemo(
    () =>
      Array.from(new Set(prospects.map((p) => p.segment).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b, "es")
      ),
    [prospects]
  );

  const stats = useMemo(() => {
    const by = (pri: string) => prospects.filter((p) => p.priority === pri).length;
    return {
      total: prospects.length,
      a: by("A"),
      b: by("B"),
      c: by("C"),
      worked: prospects.filter((p) => p.status !== "pendiente").length,
      booked: prospects.filter((p) => p.status === "agendado").length,
    };
  }, [prospects]);

  // Conteo por estado para el selector: se ve cuánto queda sin abrirlo.
  const statusCounts = useMemo(() => {
    const counts = Object.fromEntries(
      PROSPECT_STATUSES.map((s) => [s, 0])
    ) as Record<ProspectStatus, number>;
    for (const p of prospects) counts[p.status] = (counts[p.status] ?? 0) + 1;
    return counts;
  }, [prospects]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return prospects
      .filter((p) => {
        const okFilter = filter === "all" || p.priority === filter;
        const okStatus = statusFilter === "all" || p.status === statusFilter;
        const okSegment = segment === "all" || p.segment === segment;
        const okQuery = !q || searchIndex(p).includes(q);
        return okFilter && okStatus && okSegment && okQuery;
      })
      .sort(byProspectOrder);
  }, [prospects, filter, statusFilter, segment, query]);

  const filtersActive =
    filter !== "all" ||
    statusFilter !== "all" ||
    segment !== "all" ||
    query.trim() !== "";

  function clearFilters() {
    setFilter("all");
    setStatusFilter("all");
    setSegment("all");
    setQuery("");
  }

  function exportCSV() {
    const headers = [
      "negocio", "rubro", "segmento", "zona", "telefono", "whatsapp",
      "prioridad", "puntaje", "canal", "estado", "notas", "proximo_paso",
    ];
    const rows = [...prospects].sort(byProspectOrder).map((p) => [
      p.name, p.kind, p.segment, p.zone, p.phone, p.whatsapp ?? "",
      p.priority, String(p.score), p.channel, p.status, p.notes, p.next_step,
    ]);
    const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
    // BOM + ';' para que Excel en español lo abra en columnas sin tocar nada.
    const csv =
      "\uFEFF" +
      [headers, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "prospeccion-razor.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <AppHeader
        currentUserName={currentUserName}
        title="Prospección · Grecia"
        subtitle="Fichas verificadas, mensajes listos y estado compartido del equipo"
        actions={
          <>
            <button className="btn" onClick={exportCSV}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              Exportar
            </button>
            <button className="btn btn-primary" onClick={openNew}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Nueva ficha
            </button>
          </>
        }
      >
        <div className="pros-stats">
          {[
            ["Fichas", stats.total],
            ["Prioridad A", stats.a],
            ["Prioridad B", stats.b],
            ["Prioridad C", stats.c],
            ["Ya trabajadas", stats.worked],
            ["Agendadas", stats.booked],
          ].map(([label, value]) => (
            <div key={label as string} className="stat">
              <b>{value}</b>
              {label}
            </div>
          ))}
        </div>

        <div className="pros-bar">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar negocio, rubro, zona o notas…"
            aria-label="Buscar ficha"
          />
          <div className="filters">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                className={`chip ${filter === f.id ? "on" : ""}`}
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <select
            className={statusFilter !== "all" ? "on" : ""}
            value={statusFilter}
            aria-label="Filtrar por estado"
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="all">Todos los estados ({prospects.length})</option>
            {PROSPECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label} ({statusCounts[s]})
              </option>
            ))}
          </select>
          <select
            className={segment !== "all" ? "on" : ""}
            value={segment}
            aria-label="Filtrar por segmento"
            onChange={(e) => setSegment(e.target.value)}
          >
            <option value="all">Todos los segmentos</option>
            {segments.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {filtersActive && (
            <button className="chip chip-clear" onClick={clearFilters}>
              Limpiar filtros
            </button>
          )}
        </div>
      </AppHeader>

      <main className="pros-wrap">
        <PitchBlock />

        {loading ? (
          <div aria-busy="true" aria-label="Cargando fichas">
            <p className="pros-count">
              <span className="sk sk-line" style={{ width: 150 }} />
            </p>
            {[0, 1, 2].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : loadError ? (
          <div className="loading">
            No se pudieron cargar las fichas.{" "}
            <button
              className="btn"
              style={{ marginLeft: 8 }}
              onClick={() => {
                setLoading(true);
                load();
              }}
            >
              Reintentar
            </button>
          </div>
        ) : (
          <>
            <p className="pros-count">
              Mostrando <b>{visible.length}</b> de <b>{prospects.length}</b>{" "}
              fichas
            </p>
            {visible.length === 0 ? (
              <div className="loading">
                Ninguna ficha coincide con ese filtro.{" "}
                <button
                  className="btn"
                  style={{ marginLeft: 8 }}
                  onClick={clearFilters}
                >
                  Limpiar filtros
                </button>
              </div>
            ) : (
              visible.map((p) => (
                <ProspectCard
                  key={p.id}
                  p={p}
                  scripts={scripts}
                  notesState={notesState[p.id] ?? "idle"}
                  statusSaving={!!statusSaving[p.id]}
                  onEdit={() => openEdit(p)}
                  onCopy={(text, kind) => copyFor(p, text, kind)}
                  onStatus={(status) => setStatus(p.id, status)}
                  onNotes={(notes) => onNotes(p.id, notes)}
                />
              ))
            )}
          </>
        )}

        <h2>Guiones fijos (iguales para todos)</h2>
        <QualifyingQuestions />
        {scripts.map((s) => (
          <div key={s.id} className="pros-note">
            <b>{s.title}</b>
            <div className="pros-script-body">
              {fillTemplate(s.body, "[negocio]")}
            </div>
            <div className="pros-actions">
              <button
                className="btn"
                onClick={async () => {
                  const ok = await writeClipboard(
                    fillTemplate(s.body, "[negocio]")
                  );
                  push(ok ? "Copiado." : "No se pudo copiar.", {
                    tone: ok ? "info" : "error",
                  });
                }}
              >
                Copiar
              </button>
              <button
                className="btn"
                onClick={() => {
                  setScriptEditing(s);
                  setScriptOpen(true);
                }}
              >
                Editar
              </button>
            </div>
          </div>
        ))}
        <div className="pros-actions">
          <button
            className="btn"
            onClick={() => {
              setScriptEditing(null);
              setScriptOpen(true);
            }}
          >
            + Nuevo guion
          </button>
        </div>

        <h2>Cómo se calculó el puntaje</h2>
        <ScoringTable />

        <h2>Reglas de contacto</h2>
        <ContactRules />

        <h2>Qué NO decir (aplica a todos)</h2>
        <NeverSay />
      </main>

      {modalOpen && (
        <ProspectModal
          key={editing?.id ?? "nueva"}
          initial={editing}
          saving={saving}
          onClose={closeModal}
          onSave={saveProspect}
          onDelete={deleteProspect}
        />
      )}

      {scriptOpen && (
        <ScriptModal
          key={scriptEditing?.id ?? "nuevo-guion"}
          initial={scriptEditing}
          saving={saving}
          onClose={() => {
            setScriptOpen(false);
            setScriptEditing(null);
            setSaving(false);
          }}
          onSave={saveScript}
          onDelete={deleteScript}
        />
      )}

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
