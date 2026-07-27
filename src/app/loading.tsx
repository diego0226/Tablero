// Esqueleto de la cabecera mientras Next resuelve la página en el servidor.
// La estructura es la misma que la real para que no salte al aparecer.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Cargando">
      <header>
        <div className="head-row">
          <div className="title-wrap">
            <span className="sk" style={{ width: 38, height: 38, borderRadius: 10 }} />
            <div className="sk-col">
              <span className="sk sk-line" style={{ width: 190, height: 18 }} />
              <span className="sk sk-line" style={{ width: 250 }} />
            </div>
          </div>
          <div className="actions">
            <span className="sk" style={{ width: 120, height: 30 }} />
            <span className="sk" style={{ width: 104, height: 34 }} />
            <span className="sk" style={{ width: 76, height: 34 }} />
          </div>
        </div>
        <div className="tabs">
          <span className="sk" style={{ width: 84, height: 30, margin: "4px 4px 8px" }} />
          <span className="sk" style={{ width: 104, height: 30, margin: "4px 4px 8px" }} />
        </div>
      </header>
      <div className="sk-page">
        <span className="sk" style={{ height: 78 }} />
        <span className="sk" style={{ height: 210 }} />
        <span className="sk" style={{ height: 210 }} />
      </div>
    </div>
  );
}
