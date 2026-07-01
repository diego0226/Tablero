"use client";

// Error boundary de la ruta. Evita la pantalla en blanco y no filtra el
// stack trace al usuario (Next ya oculta el detalle en producción).
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="loading" style={{ display: "grid", gap: 14, placeItems: "center" }}>
      <div>Algo salió mal al cargar el tablero.</div>
      {error?.digest && (
        <div style={{ fontSize: 12 }}>Código de referencia: {error.digest}</div>
      )}
      <button className="btn btn-primary" onClick={() => reset()}>
        Reintentar
      </button>
    </div>
  );
}
