// Material fijo de la campaña: cómo se posiciona Razor, cómo se calificó cada
// negocio y qué está prohibido decir. No vive en base de datos porque no es
// estado de trabajo: es el criterio con el que se escribieron las fichas.

export const PROMO = {
  precio: "₡50.000",
  lista: "₡100.000",
  mensual: "₡12.500",
};

export function PitchBlock() {
  return (
    <>
      <div className="pros-promo">
        <b>Descuento Grecia 50%:</b> por ser del cantón, la implementación queda
        en <b>{PROMO.precio}</b> — la mitad de los {PROMO.lista} de lista. No va
        en el primer mensaje: es la carta para cuando pregunten precio o digan
        que está caro.
      </div>

      <div className="pros-note">
        <h3>Cómo se posiciona Razor en estos mensajes</h3>
        <ul>
          <li>
            <b>Escribís como Razor</b>, no como alguien que hace páginas. “Le
            escribo de Razor” abre todos los mensajes.
          </li>
          <li>
            <b>Razor es un sistema de citas</b> que <i>incluye</i> la página de
            reservas. La página es parte del servicio, no el producto.
          </li>
          <li>
            <b>La comparación es contra mandar a hacer una web</b>: cuesta una
            fracción y, a diferencia de una web, esto sí le lleva la agenda.
          </li>
          <li>
            <b>Lo que se vende es tiempo y plata</b>: dejar de contestar “¿tenés
            campo?” y dejar de perder horas por gente que no llega.
          </li>
          <li>
            <b>Sin números inventados.</b> Podés decir que cuesta bastante menos
            que una web; no podés prometer X% menos ausencias ni tanta plata al
            mes.
          </li>
        </ul>
      </div>
    </>
  );
}

export function QualifyingQuestions() {
  return (
    <div className="pros-note">
      <p style={{ marginBottom: 4 }}>
        <b>Preguntas de calificación</b> — no las tirés de golpe, una por turno
        de conversación:
      </p>
      <ul>
        <li>¿Cuántas personas atienden ahí ahorita?</li>
        <li>¿Cómo llevan las citas hoy — WhatsApp, libreta, alguna agenda digital?</li>
        <li>Más o menos, ¿cuántas citas manejan por semana?</li>
        <li>¿Se les da mucho que la gente no llegue o cancele a última hora?</li>
      </ul>
      <p className="pros-note-foot">
        Con esas cuatro sabés si califica: 2+ personas atendiendo, gestión
        manual y ausencias frecuentes = candidato de demo inmediata.
      </p>
    </div>
  );
}

const SCORING: [string, string, string][] = [
  ["Rubro que trabaja 100% por cita", "30", "Categoría de Google Maps"],
  ["Demanda alta (50+ reseñas o 2 mil+ seguidores)", "+15", "Conteo real en Maps / Facebook"],
  ["Web propia sin reserva en línea", "+15", "Visité el sitio y leí el flujo de agendar"],
  ["Enlace de web roto o caído", "+15", "DNS no resuelve / “Site not found”"],
  [
    "Todo entra por WhatsApp (link wa.me o botón que va a WhatsApp)",
    "+12",
    "Campo “sitio web” en Maps o CTA del sitio",
  ],
  ["Sin ningún enlace de reservas visible", "+10", "Ficha de Maps y página de Facebook"],
  ["Varias líneas de servicio (duraciones distintas)", "+8", "Categorías múltiples o catálogo del sitio"],
  ["Celular (posible WhatsApp) en vez de solo fijo", "+5", "Prefijo 6/7/8 del número"],
  ["Reseñas bajas o casi ninguna, sin señales de actividad", "−25", "Maps"],
];

export function ScoringTable() {
  return (
    <div className="pros-note">
      <div className="pros-scroll">
        <table className="pros-table">
          <thead>
            <tr>
              <th>Señal</th>
              <th>Puntos</th>
              <th>Cómo la verifiqué</th>
            </tr>
          </thead>
          <tbody>
            {SCORING.map(([signal, points, how]) => (
              <tr key={signal}>
                <td>{signal}</td>
                <td className="num">{points}</td>
                <td>{how}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="pros-note-foot">
        Corte: <b>A ≥ 70</b> · <b>B 45–69</b> · <b>C &lt; 45</b>. Un negocio con
        menos de dos señales verificadas nunca sube de B, aunque el rubro calce.
      </p>
    </div>
  );
}

export function ContactRules() {
  return (
    <div className="pros-note">
      <ul>
        <li>
          <b>Nada de envíos masivos.</b> Instagram y WhatsApp limitan el envío
          en frío; mandá pocos por día, escritos uno por uno, y desde una cuenta
          con actividad real.
        </li>
        <li>
          <b>WhatsApp Business:</b> escribir primero a alguien que no te
          escribió es contacto en frío. Un número comercial publicado en Maps o
          en su web es una puerta razonable; un número personal que conseguiste
          por otro lado, no.
        </li>
        <li>
          <b>Un solo seguimiento.</b> Si no responden al seguimiento de los 3
          días, se cierra. No hay tercer mensaje.
        </li>
        <li>
          <b>Si piden que no les escribás más</b>, respondés con el guion de
          cierre, los marcás “No contactar” y ahí muere.
        </li>
        <li>
          <b>Nunca mandés precio en el primer mensaje</b>, ni intentés cerrar.
          El objetivo del primer contacto es que te contesten una pregunta.
        </li>
        <li>
          <b>Solo datos verificables.</b> Si vas a decir “vi que…”, tiene que
          ser algo que cualquiera pueda ver desde afuera.
        </li>
      </ul>
    </div>
  );
}

export function NeverSay() {
  return (
    <div className="pros-note pros-note-warn">
      <ul>
        <li>
          Que están desordenados, que pierden clientes o que tienen ausencias —{" "}
          <b>nadie te lo ha dicho</b>.
        </li>
        <li>Cuánta gente atiende, cuánto cobran o cuánto facturan.</li>
        <li>
          “Vi que tu agenda está saturada” / “vi tu increíble negocio” — suena a
          plantilla y no lo podés saber.
        </li>
        <li>
          Prometer más ventas, X% menos ausencias o cuánta plata se ahorran al
          mes. Que cuesta menos que una web sí; números de resultado no.
        </li>
        <li>
          Que otra barbería o salón de Grecia “ya usa Razor”, si no es cierto y
          no tenés permiso de nombrarlos.
        </li>
      </ul>
    </div>
  );
}
