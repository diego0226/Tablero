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
  byProspectOrder,
  fillTemplate,
  searchIndex,
  uniqueSlug,
} from "@/lib/prospects";
import type { Prospect, ProspectScript, ProspectStatus } from "@/lib/types";

type PriorityFilter = "all" | "A" | "B" | "C" | "pend";

const FILTERS: { id: PriorityFilter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "A", label: "Prioridad A" },
  { id: "B", label: "Prioridad B" },
  { id: "C", label: "Prioridad C" },
  { id: "pend", label: "Sin contactar" },
];

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
  const upsertLocal = useCallback((row: Prospect) => {
    setProspects((prev) => {
      const i = prev.findIndex((p) => p.id === row.id);
      if (i === -1) return [...prev, row];
      const next = prev.slice();
      // Si hay notas sin guardar en esta ficha, no las pisamos con lo remoto.
      const local = notesPending.current.get(row.id);
      next[i] = local === undefined ? row : { ...row, notes: local };
      return next;
    });
  }, []);

  const removeLocal = useCallback((id: string) => {
    setProspects((prev) => prev.filter((p) => p.id !== id));
  }, []);

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
      setProspects((rows ?? []) as Prospect[]);
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
        (p) => upsertLocal(p.new as Prospect)
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "prospects" },
        (p) => upsertLocal(p.new as Prospect)
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
  }, [supabase, load, upsertLocal, removeLocal]);

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
  const setStatus = useCallback(
    async (id: string, status: ProspectStatus) => {
      const snapshot = prospectsRef.current;
      setProspects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status } : p))
      );
      const { error } = await supabase
        .from("prospects")
        .update({ status })
        .eq("id", id);
      if (error) {
        setProspects(snapshot);
        push("No se pudo cambiar el estado.", { tone: "error" });
      }
    },
    [supabase, push]
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

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return prospects
      .filter((p) => {
        const okFilter =
          filter === "all"
            ? true
            : filter === "pend"
              ? p.status === "pendiente"
              : p.priority === filter;
        const okSegment = segment === "all" || p.segment === segment;
        const okQuery = !q || searchIndex(p).includes(q);
        return okFilter && okSegment && okQuery;
      })
      .sort(byProspectOrder);
  }, [prospects, filter, segment, query]);

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
        </div>
      </AppHeader>

      <main className="pros-wrap">
        <PitchBlock />

        {loading ? (
          <div className="loading">Cargando fichas…</div>
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
                Ninguna ficha coincide con ese filtro.
              </div>
            ) : (
              visible.map((p) => (
                <ProspectCard
                  key={p.id}
                  p={p}
                  scripts={scripts}
                  notesState={notesState[p.id] ?? "idle"}
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
