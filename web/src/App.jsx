import { useEffect, useMemo, useState } from "react";
import Tarjeta from "./Tarjeta.jsx";
import Validacion from "./Validacion.jsx";
import Empresas from "./Empresas.jsx";
import { cargarConvocatorias, cargarValidacion, veredicto } from "./datos.js";

// Chips de la pantalla 1. "valor" es el campo `linea` que devuelve el radar.
const LINEAS = [
  { valor: "", texto: "Todas" },
  { valor: "restauracion", texto: "Restauración" },
  { valor: "conservacion", texto: "Conservación" },
  { valor: "educacion", texto: "Educación" },
  { valor: "agroambiental", texto: "Agroambiental" },
];

const ORDEN_VEREDICTO = { presenta: 0, mira: 1, pendiente: 2, descarta: 3 };

export default function App() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [linea, setLinea] = useState("");
  const [validacion, setValidacion] = useState(null);
  const [vista, setVista] = useState("convocatorias");

  useEffect(() => {
    cargarConvocatorias().then(setDatos).catch((e) => setError(e.message));
    cargarValidacion().then(setValidacion);
  }, []);

  const lista = useMemo(() => {
    if (!datos) return [];
    const q = busqueda.toLowerCase();
    return datos.convocatorias
      .filter((c) => !linea || c.linea === linea)
      .filter((c) => !q || `${c.titulo} ${c.organo} ${c.resumen} ${c.motivo}`.toLowerCase().includes(q))
      .sort((a, b) =>
        ORDEN_VEREDICTO[veredicto(a)] - ORDEN_VEREDICTO[veredicto(b)] ||
        (a.fin || "9999").localeCompare(b.fin || "9999"));
  }, [datos, busqueda, linea]);

  if (error) return <main className="estado">⚠️ {error}</main>;
  if (!datos) return <main className="estado">Cargando convocatorias…</main>;

  const recomendadas = datos.convocatorias.filter((c) => veredicto(c) === "presenta").length;

  return (
    <main>
      <header>
        <h1>🌱 Radar</h1>
        <p className="cobertura">
          El radar leyó <b>{datos.revisadas}</b> convocatorias, descartó <b>{datos.descartadas}</b> y
          te recomienda <b>{recomendadas}</b>.
        </p>
        <p className="actualizado">
          Actualizado {new Date(datos.generado).toLocaleString("es-ES")} · fuente: BDNS · {datos.modo}
        </p>
      </header>

      <nav className="pestanas">
        <button className={vista === "convocatorias" ? "activo" : ""} onClick={() => setVista("convocatorias")}>
          Convocatorias
        </button>
        <button className={vista === "empresas" ? "activo" : ""} onClick={() => setVista("empresas")}>
          Empresas
        </button>
      </nav>

      {vista === "empresas" ? <Empresas /> : (<>
      <input
        type="search"
        className="buscador"
        placeholder="Busca: charcas, plantación, educación…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />

      <nav className="chips">
        {LINEAS.map((l) => (
          <button key={l.valor} className={linea === l.valor ? "activo" : ""} onClick={() => setLinea(l.valor)}>
            {l.texto}
          </button>
        ))}
      </nav>

      <Validacion datos={validacion} />

      <h2>Nuevas para ti</h2>
      {lista.length ? lista.map((c) => <Tarjeta key={c.codigo} c={c} />)
        : <p className="estado">No hay convocatorias con estos filtros.</p>}
      </>)}
    </main>
  );
}
