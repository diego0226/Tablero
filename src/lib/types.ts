export type Epic = "A" | "B" | "C" | "D";
export type Priority = "alta" | "media" | "baja";
export type Status = "todo" | "progress" | "review" | "done";

export type Subtask = {
  text: string;
  done: boolean;
};

export type Task = {
  id: string; // uuid
  code: string; // A1, B2, ...
  ep: Epic;
  prio: Priority;
  status: Status;
  title: string;
  description: string;
  assignee: string;
  subtasks: Subtask[];
  sort_order: number;
  created_by?: string | null;
  updated_by?: string | null;
};

/* ───────────────────────────── prospección ───────────────────────────── */

export type ProspectPriority = "A" | "B" | "C";

export type ProspectStatus =
  | "pendiente"
  | "contactado"
  | "respondió"
  | "agendado"
  | "no contactar";

export type ProspectLink = {
  label: string; // Maps, Facebook, Instagram, Web…
  url: string;
};

// Una ficha de negocio: datos verificados + los mensajes ya redactados + el
// estado compartido del equipo.
export type Prospect = {
  id: string; // uuid
  slug: string; // identificador corto y estable, derivado del nombre
  name: string;
  kind: string; // rubro
  segment: string; // agrupador: Belleza, Salud, Uñas…
  zone: string;
  phone: string;
  whatsapp: string | null; // E.164 sin '+': 50688887777
  links: ProspectLink[];
  score: number;
  priority: ProspectPriority;
  appointment_fit: string;
  signals: string[]; // verificado ✓
  unverified: string[]; // sin verificar ?
  pain: string;
  angle: string;
  channel: string;
  channel_note: string;
  personalization: string;
  avoid: string; // qué NO decirle a este negocio
  msg_ig: string;
  msg_wa: string;
  msg_followup: string;
  next_step: string;
  status: ProspectStatus;
  notes: string;
  status_changed_at?: string | null;
  sort_order: number;
  created_by?: string | null;
  updated_by?: string | null;
};

// Guion de objeción global. {{N}} se sustituye por el nombre del negocio.
export type ProspectScript = {
  id: string;
  slug: string;
  title: string;
  body: string;
  sort_order: number;
};
