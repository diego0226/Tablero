"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
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
    .map((w) => w[0])
    .join("")
    .toUpperCase();
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

export default function Board({ currentUserName }: { currentUserName: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [dragOver, setDragOver] = useState<Status | null>(null);

  // modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [subInput, setSubInput] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true });
    if (!error && data) setTasks(data as Task[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("tasks-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, load]);

  // cerrar modal con Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  /* ---- drag & drop ---- */
  async function moveTask(id: string, status: Status) {
    const task = tasks.find((t) => t.id === id);
    if (!task || task.status === status) return;
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status } : t))
    );
    await supabase.from("tasks").update({ status }).eq("id", id);
  }

  /* ---- modal ---- */
  function openNew() {
    setEditingId(null);
    setDraft(emptyDraft());
    setSubInput("");
    setModalOpen(true);
    setTimeout(() => titleRef.current?.focus(), 30);
  }

  function openEdit(t: Task) {
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
  }

  function addSubtask() {
    const v = subInput.trim();
    if (!v) return;
    setDraft((d) => ({ ...d, subtasks: [...d.subtasks, { text: v, done: false }] }));
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
    const title = draft.title.trim();
    if (!title) {
      titleRef.current?.focus();
      return;
    }
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
      setTasks((prev) =>
        prev.map((t) => (t.id === editingId ? { ...t, ...payload } : t))
      );
      await supabase.from("tasks").update(payload).eq("id", editingId);
    } else {
      const nums = tasks
        .filter((t) => t.ep === draft.ep)
        .map((t) => parseInt(t.code.slice(1)) || 0);
      const code = draft.ep + ((nums.length ? Math.max(...nums) : 0) + 1);
      const maxOrder = tasks.reduce(
        (m, t) => Math.max(m, t.sort_order ?? 0),
        0
      );
      const { error } = await supabase
        .from("tasks")
        .insert({ ...payload, code, sort_order: maxOrder + 1 });
      if (error) {
        alert("Error al crear la tarea: " + error.message);
        return;
      }
    }
    setModalOpen(false);
    load();
  }

  async function deleteTask() {
    if (!editingId) return;
    if (!confirm("¿Eliminar esta tarea? No se puede deshacer.")) return;
    setTasks((prev) => prev.filter((t) => t.id !== editingId));
    await supabase.from("tasks").delete().eq("id", editingId);
    setModalOpen(false);
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(tasks, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "tablero-citas.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const doneSubs = draft.subtasks.filter((s) => s.done).length;

  return (
    <>
      <header>
        <div className="head-row">
          <div className="title-wrap">
            <div className="mark">R</div>
            <div>
              <h1>SaaS de citas — tablero</h1>
              <div className="sub">
                Estado real del proyecto (Razor · reservas para barberías)
              </div>
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
            <button className="btn" onClick={exportJSON}>
              <svg viewBox="0 0 24 24">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              Exportar
            </button>
            <button className="btn" onClick={signOut}>
              <svg viewBox="0 0 24 24">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
              Salir
            </button>
            <button className="btn btn-primary" onClick={openNew}>
              <svg viewBox="0 0 24 24">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Nueva tarea
            </button>
          </div>
        </div>

        <div className="strip">
          <div className="progress-wrap">
            <div className="progress-top">
              <span>Progreso del proyecto</span>
              <span>
                <b>{done}</b> de <b>{total}</b> tareas hechas
              </span>
            </div>
            <div className="pbar">
              <i style={{ width: `${pct}%` }} />
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
                onClick={() => setFilter(f.ep)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {loading ? (
        <div className="loading">Cargando tablero…</div>
      ) : (
        <div className="board">
          {COLS.map((col) => {
            const prioOrder = { alta: 3, media: 2, baja: 1 };
            const list = tasks
              .filter(
                (t) =>
                  t.status === col.id && (filter === "all" || t.ep === filter)
              )
              .sort((a, b) => {
                const valA = prioOrder[a.prio] || 0;
                const valB = prioOrder[b.prio] || 0;
                if (valB !== valA) {
                  return valB - valA; // de más alta a más baja
                }
                if (a.sort_order !== b.sort_order) {
                  return (a.sort_order ?? 0) - (b.sort_order ?? 0);
                }
                return a.code.localeCompare(b.code);
              });
            return (
              <div
                key={col.id}
                className={`col ${dragOver === col.id ? "drag-over" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(col.id);
                }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(null);
                  const id = e.dataTransfer.getData("id");
                  if (id) moveTask(id, col.id);
                }}
              >
                <div className="col-head">
                  <div className="col-name">
                    <span className="dot" style={{ background: col.color }} />
                    {col.name}
                  </div>
                  <span className="count">{list.length}</span>
                </div>
                <div className="col-list">
                  {list.length === 0 ? (
                    <div className="empty">Sin tareas</div>
                  ) : (
                    list.map((t) => (
                      <Card key={t.id} t={t} onClick={() => openEdit(t)} />
                    ))
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
      <div
        className={`overlay ${modalOpen ? "show" : ""}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) setModalOpen(false);
        }}
      >
        <div className="modal">
          <h3>{editingId ? "Editar tarea" : "Nueva tarea"}</h3>
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
                      onChange={() => toggleSubtask(i)}
                    />
                    <span>{s.text}</span>
                    <button
                      type="button"
                      title="Quitar"
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
              <button className="btn" onClick={() => setModalOpen(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={saveTask}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Card({ t, onClick }: { t: Task; onClick: () => void }) {
  const ep = EPICS[t.ep];
  const subs = t.subtasks ?? [];
  const total = subs.length;
  const sdone = subs.filter((s) => s.done).length;
  return (
    <div
      className="card"
      draggable
      tabIndex={0}
      onClick={onClick}
      onDragStart={(e) => {
        e.dataTransfer.setData("id", t.id);
        e.currentTarget.classList.add("dragging");
      }}
      onDragEnd={(e) => e.currentTarget.classList.remove("dragging")}
    >
      <div className="card-top">
        <span className="ep-tag" style={{ background: ep.s, color: ep.c }}>
          {t.ep} · {ep.name}
        </span>
        <span className="prio">
          <span className={`pd p-${t.prio}`} />
          {t.prio}
        </span>
      </div>
      <div className="card-title">{t.title}</div>
      {t.description && <div className="card-desc">{t.description}</div>}
      <div className="card-foot">
        <div className="left">
          <span className="code">{t.code}</span>
          {total > 0 && (
            <span className={`subbadge ${sdone === total ? "full" : ""}`}>
              ✓ {sdone}/{total}
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
