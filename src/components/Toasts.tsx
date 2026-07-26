"use client";

import { useCallback, useRef, useState } from "react";

export type Toast = {
  id: number;
  message: string;
  tone: "error" | "info";
  action?: { label: string; run: () => void };
};

type PushOptions = { tone?: Toast["tone"]; action?: Toast["action"] };

// Avisos efímeros compartidos por el tablero y la prospección. Los que traen
// acción (deshacer, marcar contactado) duran más porque hay que decidir algo.
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const push = useCallback((message: string, opts?: PushOptions) => {
    const id = ++nextId.current;
    const tone = opts?.tone ?? "info";
    setToasts((prev) => [...prev, { id, message, tone, action: opts?.action }]);
    window.setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      opts?.action ? 7000 : 4000
    );
  }, []);

  const dismiss = useCallback(
    (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)),
    []
  );

  return { toasts, push, dismiss };
}

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="toast-wrap" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`} role="status">
          <span>{t.message}</span>
          {t.action && (
            <button
              className="toast-action"
              onClick={() => {
                t.action!.run();
                onDismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
