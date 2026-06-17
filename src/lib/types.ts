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
};
