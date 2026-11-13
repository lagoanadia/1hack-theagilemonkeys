import { useCallback, useEffect, useMemo, useState } from "react";
import Tarjeta from "./Tarjeta.jsx";
import Validacion from "./Validacion.jsx";
import Empresas from "./Empresas.jsx";
import Proyectos from "./Proyectos.jsx";
import LoginGoogle from "./LoginGoogle.jsx";
import { ErrorSesion, api, guardarSesion, sesionGuardada } from "./api.js";
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
// Lo que marca el equipo manda sobre el veredicto de la IA.
const ORDEN_MARCA = { interesa: -1, descarta: 1 };
const VISTAS = ["convocatorias", "empresas", "proyectos"];
const vistaDeURL = () => (VISTAS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "convocatorias");

export default function App() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [linea, setLinea] = useState("");
  const [validacion, setValidacion] = useState(null);
  const [vista, setVista] = useState(vistaDeURL);
  const [equipo, setEquipo] = useState(false);   // ¿sesión de Google del equipo válida?
  const [email, setEmail] = useState("");
  const [marcas, setMarcas] = useState({});       // "convocatoria:923290" -> "interesa"

  const entrarEquipo = useCallback(async (token, { silencioso = false } = {}) => {
    try {
      const yo = await api("/equipo", { token });
      guardarSesion(token);
      setEquipo(true);
      setEmail(yo.email);
      const lista = await api("/estado");
      setMarcas(Object.fromEntries(lista.map((m) => [`${m.tipo}:${m.id}`, m.estado])));
    } catch (e) {
      guardarSesion("");
      setEquipo(false);
      if (!silencioso) alert(`No se pudo entrar: ${e.message}`);
    }
  }, []);

  useEffect(() => {
    cargarConvocatorias().then(setDatos).catch((e) => setError(e.message));
    cargarValidacion().then(setValidacion);
    if (sesionGuardada()) entrarEquipo(sesionGuardada(), { silencioso: true });
    const alCambiar = () => setVista(vistaDeURL());
    window.addEventListener("hashchange", alCambiar);
    return () => window.removeEventListener("hashchange", alCambiar);
  }, [entrarEquipo]);

  function salir() {
    guardarSesion("");
    window.google?.accounts.id.disableAutoSelect();
    setEquipo(false);
    setEmail("");
    setMarcas({});
  }

  // Devuelve la función para marcar un elemento (o null si no es del equipo).
  const marcador = (tipo, id) => equipo ? async (estado) => {
    const clave = `${tipo}:${id}`;
    const anterior = marcas[clave];
    setMarcas((m) => ({ ...m, [clave]: estado || undefined }));  // al instante; luego se guarda
    try {
      await api("/estado", { metodo: "PUT", datos: { tipo, id, estado } });
    } catch (e) {
      setMarcas((m) => ({ ...m, [clave]: anterior }));
      if (e instanceof ErrorSesion) {
        salir();
        alert("La sesión ha caducado: vuelve a iniciar sesión con Google.");
      } else {
        alert(`No se pudo guardar: ${e.message}`);
      }
    }
  } : null;

  const lista = useMemo(() => {
    if (!datos) return [];
    const q = busqueda.toLowerCase();
    const marca = (c) => ORDEN_MARCA[marcas[`convocatoria:${c.codigo}`]] || 0;
    return datos.convocatorias
      .filter((c) => !linea || c.linea === linea)
      .filter((c) => !q || `${c.titulo} ${c.organo} ${c.resumen} ${c.motivo}`.toLowerCase().includes(q))
      .sort((a, b) =>
        marca(a) - marca(b) ||
        ORDEN_VEREDICTO[veredicto(a)] - ORDEN_VEREDICTO[veredicto(b)] ||
        (a.fin || "9999").localeCompare(b.fin || "9999"));
  }, [datos, busqueda, linea, marcas]);

  if (error) return <main className="estado">⚠️ {error}</main>;
  if (!datos) return <main className="estado">Cargando convocatorias…</main>;

  const recomendadas = datos.convocatorias.filter((c) => veredicto(c) === "presenta").length;
  const cambiarVista = (v) => { location.hash = v; setVista(v); };

  return (
    <main>
      <header>
        <div className="cabecera">
          <h1>🌱 Radar</h1>
          {equipo
            ? <button className="enlace" onClick={salir} title="Cerrar sesión">{email} · salir</button>
            : <LoginGoogle onToken={entrarEquipo} />}
        </div>
        <p className="cobertura">
          El radar leyó <b>{datos.revisadas}</b> convocatorias, descartó <b>{datos.descartadas}</b> y
          te recomienda <b>{recomendadas}</b>.
        </p>
        <p className="actualizado">
          Actualizado {new Date(datos.generado).toLocaleString("es-ES")} · fuente: BDNS · {datos.modo}
        </p>
      </header>

      <nav className="pestanas">
        {[["convocatorias", "Convocatorias"], ["empresas", "Empresas"], ["proyectos", "Proyectos"]].map(([v, t]) => (
          <button key={v} className={vista === v ? "activo" : ""} onClick={() => cambiarVista(v)}>{t}</button>
        ))}
      </nav>

      {vista === "empresas" && <Empresas marcas={marcas} marcador={marcador} />}
      {vista === "proyectos" && <Proyectos equipo={equipo} />}
      {vista === "convocatorias" && (<>
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
        {lista.length ? lista.map((c) => (
          <Tarjeta key={c.codigo} c={c} marca={marcas[`convocatoria:${c.codigo}`]}
            onMarcar={marcador("convocatoria", c.codigo)} />
        )) : <p className="estado">No hay convocatorias con estos filtros.</p>}
      </>)}
    </main>
  );
}
