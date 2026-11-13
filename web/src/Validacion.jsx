import { ETIQUETA_VEREDICTO, veredicto } from "./datos.js";

// "Prueba con convocatorias reales": qué habría dicho el radar de convocatorias a las que
// Reforesta ya se presentó (datos de public/data/validacion.json, los genera radar.validar).

const ICONO = { cumple: "✓", duda: "?", no: "✕" };

function Caso({ c }) {
  const v = veredicto(c);
  return (
    <article className={`tarjeta ${v}`}>
      <div className="tarjeta-cabecera">
        <span className={`chip-veredicto ${v}`}>● {ETIQUETA_VEREDICTO[v]}</span>
        <span className="plazo">BDNS {c.codigo} · ya cerrada</span>
      </div>
      <h3>{c.descripcion_reto}</h3>
      <p className="organo">Organismo · {c.organo}</p>

      {c.resumen && <p className={`frase ${v}`}><b>En una frase:</b> {c.resumen}</p>}

      <h4>¿La habría encontrado?</h4>
      <ul className="lista-check">
        {c.filtros.map((f) => (
          <li key={f.paso} className={f.ok ? "cumple" : "no"}>
            <span className="icono">{f.ok ? "✓" : "✕"}</span>{f.paso}
          </li>
        ))}
      </ul>

      {c.requisitos?.length > 0 && (
        <>
          <h4>¿Podemos pedirla?</h4>
          <ul className="lista-check">
            {c.requisitos.map((r) => (
              <li key={r.texto} className={r.estado}>
                <span className="icono">{ICONO[r.estado]}</span>{r.texto}
              </li>
            ))}
          </ul>
        </>
      )}

      {c.cita && (
        <>
          <h4>Lo que dicen las bases</h4>
          <blockquote>«{c.cita}»</blockquote>
        </>
      )}

      <div className="tarjeta-pie">
        <span className="organo">{c.motivo}</span>
        <a href={c.url} target="_blank" rel="noopener noreferrer">Ver en BDNS ↗</a>
      </div>
    </article>
  );
}

export default function Validacion({ datos }) {
  if (!datos?.casos?.length) return null;
  return (
    <section className="validacion">
      <h2>Prueba con convocatorias reales de Reforesta</h2>
      <p className="cobertura">
        El radar encuentra <b>{datos.encontradas} de {datos.total}</b> convocatorias a las que Reforesta
        se presentó. Así las habría evaluado cuando estaban abiertas:
      </p>
      {datos.casos.map((c) => <Caso key={c.codigo} c={c} />)}
    </section>
  );
}
