import { ETIQUETA_VEREDICTO, diasHasta, euros, veredicto } from "./datos.js";

// Una convocatoria en la lista (pantalla 1 del wireframe).
export default function Tarjeta({ c }) {
  const v = veredicto(c);
  const dias = diasHasta(c.fin);
  const importe = euros(c.importe_max) || euros(c.presupuesto);

  return (
    <article className={`tarjeta ${v}`}>
      <div className="tarjeta-cabecera">
        <span className={`chip-veredicto ${v}`}>● {ETIQUETA_VEREDICTO[v]}</span>
        <span className={`plazo ${dias !== null && dias <= 20 ? "urgente" : ""}`}>
          {dias !== null ? `Quedan ${dias} días` : c.plazo_texto || "Plazo sin fecha fija"}
        </span>
      </div>

      <h3>{c.titulo}</h3>
      <p className="organo">Organismo · {c.organo}</p>

      {v === "pendiente" && <p className="organo">El radar la analizará con IA en la próxima ejecución.</p>}
      {(v === "presenta" || v === "mira") && (c.resumen || c.motivo) && (
        <p className={`frase ${v}`}>{c.resumen && c.resumen !== c.titulo ? c.resumen : c.motivo}</p>
      )}
      {v === "descarta" && <p className="organo">{c.motivo}</p>}

      {(v === "presenta" || v === "mira") && (
        <div className="tarjeta-pie">
          <strong>{importe ? `Hasta ${importe}` : ""}</strong>
          <a href={c.url} target="_blank" rel="noopener noreferrer">Ver en BDNS ↗</a>
        </div>
      )}
    </article>
  );
}
