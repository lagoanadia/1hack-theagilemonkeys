import { useEffect, useState } from "react";
import Marcas from "./Marcas.jsx";

// Pestaña "Empresas": empresas obligadas por una declaración de impacto ambiental (BOE)
// a ejecutar medidas que Reforesta sabe hacer. Datos: public/data/empresas.json (radar.empresas).

const ACCION = {
  contactar: { texto: "Contactar", clase: "presenta" },
  mira: { texto: "Mira", clase: "mira" },
  descarta: { texto: "Descarta", clase: "descarta" },
};
const TIPO = {
  eolico: "Parque eólico", solar: "Planta solar", linea_electrica: "Línea eléctrica",
  hibrido: "Híbrido renovable", infraestructura: "Infraestructura", otro: "Proyecto",
};

function ha(n) {
  return n ? `${Number(n).toLocaleString("es-ES", { maximumFractionDigits: 1 })} ha` : null;
}

function Empresa({ e, marca, onMarcar }) {
  const a = ACCION[e.accion] || ACCION.descarta;
  return (
    <article className={`tarjeta ${marca === "descarta" ? "apagada" : ""}`}>
      <div className="tarjeta-cabecera">
        <span className={`chip-veredicto ${a.clase}`}>● {a.texto}</span>
        <span className="plazo">BOE {new Date(e.fecha).toLocaleDateString("es-ES")}</span>
      </div>
      <h3>{e.promotor || "Promotor sin identificar"}</h3>
      <p className="organo">{TIPO[e.tipo] || "Proyecto"} · {e.proyecto} · {e.ubicacion}</p>

      {e.accion !== "descarta" && e.resumen && <p className={`frase ${a.clase}`}>{e.resumen}</p>}
      {e.accion === "descarta" && <p className="organo">{e.resumen}</p>}

      {e.accion !== "descarta" && e.medidas?.length > 0 && (
        <>
          <h4>Medidas que Reforesta podría ejecutar</h4>
          <ul className="lista-check">
            {e.medidas.map((m) => (
              <li key={m.texto} className="cumple">
                <span className="icono">✓</span>
                {m.texto}{ha(m.superficie_ha) ? ` · ${ha(m.superficie_ha)}` : ""}
              </li>
            ))}
          </ul>
        </>
      )}

      {e.accion !== "descarta" && e.cita && (
        <>
          <h4>Lo que dice el BOE</h4>
          <blockquote>«{e.cita}»</blockquote>
        </>
      )}

      <div className="tarjeta-pie">
        <strong>{ha(e.superficie_total_ha) ? `${ha(e.superficie_total_ha)} a restaurar` : ""}</strong>
        <a href={e.url} target="_blank" rel="noopener noreferrer">Ver en el BOE ↗</a>
      </div>
      <Marcas estado={marca} onMarcar={onMarcar} />
    </article>
  );
}

export default function Empresas({ marcas = {}, marcador = () => null }) {
  const [datos, setDatos] = useState(undefined);

  useEffect(() => {
    fetch("/data/empresas.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setDatos)
      .catch(() => setDatos(null));
  }, []);

  if (datos === undefined) return <p className="estado">Cargando empresas…</p>;
  if (!datos?.empresas?.length) {
    return <p className="estado">Todavía no hay empresas analizadas. Aparecerán tras la próxima ejecución del radar.</p>;
  }
  const contactar = datos.empresas.filter((e) => e.accion === "contactar").length;

  return (
    <section>
      <p className="cobertura">
        En los últimos {datos.ventana_dias} días el BOE publicó <b>{datos.revisadas}</b> declaraciones de impacto
        ambiental. Son empresas <b>obligadas</b> a compensar su impacto; <b>{contactar}</b> tienen medidas que
        Reforesta sabe hacer.
      </p>
      {datos.pendientes > 0 && (
        <p className="actualizado">{datos.pendientes} pendientes de analizar en la próxima ejecución.</p>
      )}
      {datos.empresas.map((e) => (
        <Empresa key={e.id} e={e} marca={marcas[`empresa:${e.id}`]} onMarcar={marcador("empresa", e.id)} />
      ))}
    </section>
  );
}
