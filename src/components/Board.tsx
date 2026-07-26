"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import AppHeader from "@/components/AppHeader";
import { USERS, colorForName } from "@/lib/users";
import type { Epic, Priority, Status, Subtask, Task } from "@/lib/types";

const COLS: { id: Status; name: string; color: string }[] = [
  { id: "todo", name: "Por hacer", color: "#9C9B95" },
  { id: "progress", name: "En progreso", color: "#3B7CB0" },
  { id: "review", name: "En revisión", color: "#C68A1E" },
  { id: "done", name: "Hecho", color: "#1D7A5F" },
];

const EPICS: Record<Epic, { name: string; c: string; s: string }> = {
  A: { name: "Admin SaaS", c: "var(--epA)", s: "var(--epA-s)" },
  B: { name: "Cliente", c: "var(--epB)", s: "var(--epB-s)" },
  C: { name: "Usuario", c: "var(--epC)", s: "var(--epC-s)" },
  D: { name: "Infra", c: "var(--epD)", s: "var(--epD-s)" },
};

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

// Orden de la columna: posición manual (arrastrar) y, a igualdad, por código.
function byDisplayOrder(a: Task, b: Task): number {
  const oa = a.sort_order ?? 0;
  const ob = b.sort_order ?? 0;
  if (oa !== ob) return oa - ob;
  return a.code.localeCompare(b.code);
}

type Filter = "all" | Epic;

type Draft = {
  title: string;
  description: string;
  ep: Epic;
  prio: Priority;
  status: Status;
  assignee: string;
  subtasks: Subtask[];
};

const emptyDraft = (): Draft => ({
  title: "",
  description: "",
  ep: "B",
  prio: "media",
  status: "todo",
  assignee: "",
  subtasks: [],
});

type Toast = {
  id: number;
  message: string;
  tone: "error" | "info";
  action?: { label: string; run: () => void };
};

type DropInfo = { status: Status; index: number };

export default function Board({ currentUserName }: { currentUserName: string }) {
  const supabase = useMemo(() => createClient(), []);

  const [tasks, setTasks] = useState<Task[]>([]);
  const tasksRef = useRef<Task[]>([]);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  // toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const pushToast = useCallback(
    (
      message: string,
      opts?: { tone?: "error" | "info"; action?: Toast["action"] }
    ) => {
      const id = ++toastId.current;
      const tone = opts?.tone ?? "info";
      setToasts((prev) => [...prev, { id, message, tone, action: opts?.action }]);
      const ttl = opts?.action ? 7000 : 4000;
      window.setTimeout(
        () => setToasts((prev) => prev.filter((t) => t.id !== id)),
        ttl
      );
    },
    []
  );
  const dismissToast = (id: number) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));

  // modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [subInput, setSubInput] = useState("");
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  // drag & drop (punteros: funciona con ratón y táctil)
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropInfo, setDropInfo] = useState<DropInfo | null>(null);
  const dropRef = useRef<DropInfo | null>(null);
  const justDragged = useRef(false);
  const drag = useRef<{
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    width: number;
    active: boolean;
    ghost: HTMLElement | null;
  } | null>(null);

  /* ---------------------------------------------------------------- datos */
  const upsertLocal = useCallback((row: Task) => {
    setTasks((prev) => {
      const i = prev.findIndex((t) => t.id === row.id);
      if (i === -1) return [...prev, row];
      const next = prev.slice();
      next[i] = row;
      return next;
    });
  }, []);

  const removeLocal = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("tasks").select("*");
    if (error) {
      setLoadError(true);
    } else {
      setLoadError(false);
      setTasks((data ?? []) as Task[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
    // Realtime incremental: aplicamos cada cambio en vez de recargar todo.
    const channel = supabase
      .channel("tasks-changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tasks" },
        (p) => upsertLocal(p.new as Task)
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tasks" },
        (p) => upsertLocal(p.new as Task)
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "tasks" },
        (p) => removeLocal((p.old as { id: string }).id)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, load, upsertLocal, removeLocal]);

  const total = useMemo(() => {
    const visible =
      filter === "all" ? tasks : tasks.filter((t) => t.ep === filter);
    const done = visible.filter((t) => t.status === "done").length;
    return {
      count: visible.length,
      done,
      pct: visible.length ? Math.round((done / visible.length) * 100) : 0,
    };
  }, [tasks, filter]);

  /* ----------------------------------------------------- drag & drop core */
  const computeDrop = useCallback(
    (x: number, y: number, draggedId: string): DropInfo | null => {
      const el = document.elementFromPoint(x, y);
      const colEl = el?.closest("[data-col]") as HTMLElement | null;
      if (!colEl) return null;
      const status = colEl.getAttribute("data-col") as Status;
      const cards = Array.from(
        colEl.querySelectorAll<HTMLElement>("[data-card-id]")
      ).filter((c) => c.getAttribute("data-card-id") !== draggedId);
      let index = cards.length;
      for (let i = 0; i < cards.length; i++) {
        const r = cards[i].getBoundingClientRect();
        if (y < r.top + r.height / 2) {
          index = i;
          break;
        }
      }
      return { status, index };
    },
    []
  );

  const commitDrop = useCallback(
    (id: string, target: DropInfo) => {
      const list = tasksRef.current;
      const dragged = list.find((t) => t.id === id);
      if (!dragged) return;
      const col = list
        .filter((t) => t.status === target.status && t.id !== id)
        .sort(byDisplayOrder);
      const before = col[target.index - 1];
      const after = col[target.index];
      let order: number;
      if (!before && !after) order = 1;
      else if (!before) order = (after.sort_order ?? 0) - 1;
      else if (!after) order = (before.sort_order ?? 0) + 1;
      else order = ((before.sort_order ?? 0) + (after.sort_order ?? 0)) / 2;

      if (dragged.status === target.status && dragged.sort_order === order)
        return;

      const snapshot = list;
      setTasks((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, status: target.status, sort_order: order } : t
        )
      );
      supabase
        .from("tasks")
        .update({ status: target.status, sort_order: order })
        .eq("id", id)
        .then(({ error }) => {
          if (error) {
            setTasks(snapshot);
            pushToast("No se pudo mover la tarea.", { tone: "error" });
          }
        });
    },
    [supabase, pushToast]
  );

  const endDrag = useCallback(() => {
    const st = drag.current;
    if (st?.ghost) st.ghost.remove();
    drag.current = null;
    dropRef.current = null;
    setDraggingId(null);
    setDropInfo(null);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onCancel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const st = drag.current;
      if (!st || e.pointerId !== st.pointerId) return;
      if (!st.active) {
        const dist = Math.hypot(e.clientX - st.startX, e.clientY - st.startY);
        if (dist < 6) return;
        st.active = true;
        setDraggingId(st.id);
        const src = document.querySelector<HTMLElement>(
          `[data-card-id="${st.id}"]`
        );
        if (src) {
          const ghost = src.cloneNode(true) as HTMLElement;
          ghost.classList.add("drag-ghost");
          ghost.style.width = `${st.width}px`;
          document.body.appendChild(ghost);
          st.ghost = ghost;
        }
      }
      if (st.ghost) {
        st.ghost.style.transform = `translate(${e.clientX - st.offsetX}px, ${
          e.clientY - st.offsetY
        }px) rotate(1.5deg)`;
      }
      const target = computeDrop(e.clientX, e.clientY, st.id);
      dropRef.current = target;
      setDropInfo(target);
    },
    [computeDrop]
  );

  const onPointerUp = useCallback(() => {
    const st = drag.current;
    const wasActive = !!st?.active;
    const id = st?.id;
    const target = dropRef.current;
    endDrag();
    if (wasActive) {
      justDragged.current = true;
      window.setTimeout(() => (justDragged.current = false), 0);
      if (id && target) commitDrop(id, target);
    }
  }, [commitDrop, endDrag]);

  const onCancel = useCallback(() => endDrag(), [endDrag]);

  // Registramos/limpiamos los listeners globales al iniciar cada arrastre.
  const startDrag = useCallback(
    (e: React.PointerEvent, task: Task) => {
      if (e.button && e.button !== 0) return; // solo botón principal del ratón
      const cardEl = (e.currentTarget as HTMLElement).closest(
        "[data-card-id]"
      ) as HTMLElement | null;
      if (!cardEl) return;
      const rect = cardEl.getBoundingClientRect();
      drag.current = {
        id: task.id,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
        width: rect.width,
        active: false,
        ghost: null,
      };
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onCancel);
      e.preventDefault();
      e.stopPropagation();
    },
    [onPointerMove, onPointerUp, onCancel]
  );

  useEffect(() => () => endDrag(), [endDrag]);

  /* -------------------------------------------------------------- modal */
  const closeModal = useCallback(() => {
    setModalOpen(false);
    setSaving(false);
    lastFocused.current?.focus?.();
  }, []);

  function openNew() {
    lastFocused.current = document.activeElement as HTMLElement;
    setEditingId(null);
    setDraft(emptyDraft());
    setSubInput("");
    setModalOpen(true);
    setTimeout(() => titleRef.current?.focus(), 30);
  }

  function openEdit(t: Task) {
    lastFocused.current = document.activeElement as HTMLElement;
    setEditingId(t.id);
    setDraft({
      title: t.title,
      description: t.description ?? "",
      ep: t.ep,
      prio: t.prio,
      status: t.status,
      assignee: t.assignee ?? "",
      subtasks: (t.subtasks ?? []).map((s) => ({ ...s })),
    });
    setSubInput("");
    setModalOpen(true);
    setTimeout(() => titleRef.current?.focus(), 30);
  }

  // Escape cierra el modal o cancela un arrastre en curso.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (drag.current) {
        endDrag();
        return;
      }
      if (modalOpen) closeModal();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modalOpen, closeModal, endDrag]);

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

  function addSubtask() {
    const v = subInput.trim();
    if (!v) return;
    setDraft((d) => ({
      ...d,
      subtasks: [...d.subtasks, { text: v, done: false }],
    }));
    setSubInput("");
  }
  function toggleSubtask(i: number) {
    setDraft((d) => ({
      ...d,
      subtasks: d.subtasks.map((s, idx) =>
        idx === i ? { ...s, done: !s.done } : s
      ),
    }));
  }
  function removeSubtask(i: number) {
    setDraft((d) => ({
      ...d,
      subtasks: d.subtasks.filter((_, idx) => idx !== i),
    }));
  }

  async function saveTask() {
    if (saving) return;
    const title = draft.title.trim();
    if (!title) {
      titleRef.current?.focus();
      return;
    }
    setSaving(true);
    const payload = {
      title,
      description: draft.description.trim(),
      ep: draft.ep,
      prio: draft.prio,
      status: draft.status,
      assignee: draft.assignee.trim(),
      subtasks: draft.subtasks,
    };

    if (editingId) {
      const snapshot = tasksRef.current;
      setTasks((prev) =>
        prev.map((t) => (t.id === editingId ? { ...t, ...payload } : t))
      );
      const { error } = await supabase
        .from("tasks")
        .update(payload)
        .eq("id", editingId);
      if (error) {
        setTasks(snapshot);
        setSaving(false);
        pushToast("No se pudo guardar la tarea.", { tone: "error" });
        return;
      }
    } else {
      // El código y el orden los asigna el servidor (migración 0004), sin
      // carreras entre usuarios.
      const { data, error } = await supabase
        .from("tasks")
        .insert(payload)
        .select()
        .single();
      if (error) {
        setSaving(false);
        pushToast("No se pudo crear la tarea.", { tone: "error" });
        return;
      }
      if (data) upsertLocal(data as Task);
    }
    closeModal();
  }

  async function deleteTask() {
    if (!editingId) return;
    if (!confirm("¿Eliminar esta tarea?")) return;
    const snap = tasksRef.current.find((t) => t.id === editingId);
    if (!snap) return;
    removeLocal(editingId);
    closeModal();
    const { error } = await supabase.from("tasks").delete().eq("id", editingId);
    if (error) {
      upsertLocal(snap);
      pushToast("No se pudo eliminar la tarea.", { tone: "error" });
      return;
    }
    pushToast(`Tarea ${snap.code} eliminada.`, {
      tone: "info",
      action: {
        label: "Deshacer",
        run: async () => {
          const { error: e2 } = await supabase.from("tasks").insert({
            id: snap.id,
            code: snap.code,
            ep: snap.ep,
            prio: snap.prio,
            status: snap.status,
            title: snap.title,
            description: snap.description,
            assignee: snap.assignee,
            subtasks: snap.subtasks,
            sort_order: snap.sort_order,
          });
          if (e2) {
            pushToast("No se pudo restaurar la tarea.", { tone: "error" });
          } else {
            upsertLocal(snap);
          }
        },
      },
    });
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(tasks, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "tablero-razor.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const doneSubs = draft.subtasks.filter((s) => s.done).length;

  return (
    <>
      <AppHeader
        currentUserName={currentUserName}
        title="SaaS de citas — tablero"
        subtitle="Estado real del proyecto (Razor · reservas para barberías)"
        actions={
          <>
            <button className="btn" onClick={exportJSON}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              Exportar
            </button>
            <button className="btn btn-primary" onClick={openNew}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Nueva tarea
            </button>
          </>
        }
      >
        <div className="strip">
          <div className="progress-wrap">
            <div className="progress-top">
              <span>Progreso {filter === "all" ? "del proyecto" : `· épica ${filter}`}</span>
              <span>
                <b>{total.done}</b> de <b>{total.count}</b> tareas hechas
              </span>
            </div>
            <div
              className="pbar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={total.pct}
              aria-label="Progreso del proyecto"
            >
              <i style={{ width: `${total.pct}%` }} />
            </div>
          </div>
          <div className="filters">
            {(
              [
                { ep: "all", label: "Todas" },
                { ep: "A", label: "A · Admin SaaS" },
                { ep: "B", label: "B · Cliente" },
                { ep: "C", label: "C · Usuario final" },
                { ep: "D", label: "D · Infraestructura" },
              ] as { ep: Filter; label: string }[]
            ).map((f) => (
              <button
                key={f.ep}
                className={`chip ${filter === f.ep ? "on" : ""}`}
                aria-pressed={filter === f.ep}
                onClick={() => setFilter(f.ep)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </AppHeader>

      {loading ? (
        <div className="loading">Cargando tablero…</div>
      ) : loadError ? (
        <div className="loading">
          No se pudo cargar el tablero.{" "}
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
        <div className="board">
          {COLS.map((col) => {
            let list = tasks
              .filter(
                (t) =>
                  t.status === col.id && (filter === "all" || t.ep === filter)
              )
              .sort(byDisplayOrder);
            if (draggingId) list = list.filter((t) => t.id !== draggingId);
            const showLine = dropInfo?.status === col.id ? dropInfo.index : -1;
            return (
              <div
                key={col.id}
                data-col={col.id}
                className={`col ${dropInfo?.status === col.id ? "drag-over" : ""}`}
              >
                <div className="col-head">
                  <div className="col-name">
                    <span className="dot" style={{ background: col.color }} />
                    {col.name}
                  </div>
                  <span className="count">{list.length}</span>
                </div>
                <div className="col-list">
                  {list.length === 0 && showLine < 0 ? (
                    <div className="empty">Sin tareas</div>
                  ) : (
                    <>
                      {list.map((t, i) => (
                        <div key={t.id} style={{ display: "contents" }}>
                          {showLine === i && <div className="drop-line" />}
                          <Card
                            t={t}
                            onOpen={() => {
                              if (justDragged.current) return;
                              openEdit(t);
                            }}
                            onGrip={(e) => startDrag(e, t)}
                          />
                        </div>
                      ))}
                      {showLine >= list.length && <div className="drop-line" />}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="legend">
        <span>
          <span className="dot" style={{ background: "var(--epA)" }} /> Épica A —
          Panel maestro (vos)
        </span>
        <span>
          <span className="dot" style={{ background: "var(--epB)" }} /> Épica B —
          Panel del cliente
        </span>
        <span>
          <span className="dot" style={{ background: "var(--epC)" }} /> Épica C —
          Usuario final
        </span>
        <span>
          <span className="dot" style={{ background: "var(--epD)" }} /> Épica D —
          Infraestructura
        </span>
      </div>

      {/* MODAL */}
      {modalOpen && (
        <div
          className="overlay show"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div
            className="modal"
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onKeyDown={onModalKeyDown}
          >
            <h3 id="modal-title">{editingId ? "Editar tarea" : "Nueva tarea"}</h3>
            <div className="field">
              <label htmlFor="f-title">Título</label>
              <input
                id="f-title"
                ref={titleRef}
                placeholder="¿Qué hay que construir?"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="f-desc">Descripción</label>
              <textarea
                id="f-desc"
                placeholder="Contexto de la tarea…"
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </div>
            <div className="field">
              <label>
                Subtareas{" "}
                <span className="sub-count">
                  {draft.subtasks.length
                    ? `(${doneSubs}/${draft.subtasks.length})`
                    : ""}
                </span>
              </label>
              <div className="sub-list">
                {draft.subtasks.length === 0 ? (
                  <div className="empty" style={{ padding: "8px 0" }}>
                    Sin subtareas todavía
                  </div>
                ) : (
                  draft.subtasks.map((s, i) => (
                    <div key={i} className={`sub-item ${s.done ? "done" : ""}`}>
                      <input
                        type="checkbox"
                        checked={s.done}
                        aria-label={`Marcar subtarea: ${s.text}`}
                        onChange={() => toggleSubtask(i)}
                      />
                      <span>{s.text}</span>
                      <button
                        type="button"
                        aria-label={`Quitar subtarea: ${s.text}`}
                        onClick={() => removeSubtask(i)}
                      >
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>
              <div className="sub-add">
                <input
                  placeholder="Añadir subtarea y pulsar Enter"
                  aria-label="Nueva subtarea"
                  value={subInput}
                  onChange={(e) => setSubInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSubtask();
                    }
                  }}
                />
                <button type="button" className="btn" onClick={addSubtask}>
                  Añadir
                </button>
              </div>
            </div>
            <div className="row2">
              <div className="field">
                <label htmlFor="f-epic">Épica</label>
                <select
                  id="f-epic"
                  value={draft.ep}
                  onChange={(e) =>
                    setDraft({ ...draft, ep: e.target.value as Epic })
                  }
                >
                  <option value="A">A · Admin SaaS</option>
                  <option value="B">B · Cliente</option>
                  <option value="C">C · Usuario final</option>
                  <option value="D">D · Infraestructura</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="f-prio">Prioridad</label>
                <select
                  id="f-prio"
                  value={draft.prio}
                  onChange={(e) =>
                    setDraft({ ...draft, prio: e.target.value as Priority })
                  }
                >
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baja">Baja</option>
                </select>
              </div>
            </div>
            <div className="row2">
              <div className="field">
                <label htmlFor="f-status">Columna</label>
                <select
                  id="f-status"
                  value={draft.status}
                  onChange={(e) =>
                    setDraft({ ...draft, status: e.target.value as Status })
                  }
                >
                  <option value="todo">Por hacer</option>
                  <option value="progress">En progreso</option>
                  <option value="review">En revisión</option>
                  <option value="done">Hecho</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="f-assignee">Responsable</label>
                <select
                  id="f-assignee"
                  value={draft.assignee}
                  onChange={(e) =>
                    setDraft({ ...draft, assignee: e.target.value })
                  }
                >
                  <option value="">Sin asignar</option>
                  {USERS.map((u) => (
                    <option key={u.username} value={u.name}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-foot">
              {editingId ? (
                <button className="link-danger" onClick={deleteTask}>
                  Eliminar tarea
                </button>
              ) : (
                <span />
              )}
              <div className="right">
                <button className="btn" onClick={closeModal} disabled={saving}>
                  Cancelar
                </button>
                <button
                  className="btn btn-primary"
                  onClick={saveTask}
                  disabled={saving}
                >
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TOASTS */}
      <div className="toast-wrap" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`} role="status">
            <span>{t.message}</span>
            {t.action && (
              <button
                className="toast-action"
                onClick={() => {
                  t.action!.run();
                  dismissToast(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function Card({
  t,
  onOpen,
  onGrip,
}: {
  t: Task;
  onOpen: () => void;
  onGrip: (e: React.PointerEvent) => void;
}) {
  const ep = EPICS[t.ep];
  const subs = t.subtasks ?? [];
  const totalSubs = subs.length;
  const sdone = subs.filter((s) => s.done).length;
  return (
    <div
      className="card"
      data-card-id={t.id}
      role="button"
      tabIndex={0}
      aria-label={`Tarea ${t.code}: ${t.title}. Pulsa Enter para editar.`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="card-top">
        <span className="ep-tag" style={{ background: ep.s, color: ep.c }}>
          {t.ep} · {ep.name}
        </span>
        <div className="card-top-right">
          <span className="prio">
            <span className={`pd p-${t.prio}`} />
            {t.prio}
          </span>
          <button
            type="button"
            className="grip"
            aria-label={`Arrastrar tarea ${t.code}`}
            title="Arrastrar para mover"
            onPointerDown={onGrip}
            onClick={(e) => e.stopPropagation()}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="7" cy="5" r="1.4" />
              <circle cx="7" cy="10" r="1.4" />
              <circle cx="7" cy="15" r="1.4" />
              <circle cx="13" cy="5" r="1.4" />
              <circle cx="13" cy="10" r="1.4" />
              <circle cx="13" cy="15" r="1.4" />
            </svg>
          </button>
        </div>
      </div>
      <div className="card-title">{t.title}</div>
      {t.description && <div className="card-desc">{t.description}</div>}
      <div className="card-foot">
        <div className="left">
          <span className="code">{t.code}</span>
          {totalSubs > 0 && (
            <span className={`subbadge ${sdone === totalSubs ? "full" : ""}`}>
              ✓ {sdone}/{totalSubs}
            </span>
          )}
        </div>
        {t.assignee ? (
          <span
            className="assignee"
            style={{ background: colorForName(t.assignee) }}
            title={t.assignee}
          >
            {initials(t.assignee)}
          </span>
        ) : (
          <span className="assignee none" title="Sin asignar">
            +
          </span>
        )}
      </div>
    </div>
  );
}
