import { useEffect, useState } from "react";
import { api } from "./api.js";
import { euros } from "./datos.js";

// Pestaña "Proyectos": Reforesta publica lo que quiere restaurar y las empresas dicen
// "quiero ayudar". Las empresas no necesitan cuenta; el equipo ve quién se ha interesado.

function FormularioAyuda({ proyecto, onListo }) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function enviar(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    setEnviando(true);
    setError("");
    try {
      await api(`/proyectos/${proyecto.id}/interes`, { datos: Object.fromEntries(f), metodo: "POST" });
      onListo();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="formulario" onSubmit={enviar}>
      <input name="empresa" placeholder="Nombre de la empresa" required maxLength={150} />
      <input name="contacto" placeholder="Email o teléfono de contacto" required maxLength={150} />
      <textarea name="mensaje" placeholder="¿Cómo os gustaría colaborar? (opcional)" maxLength={1000} />
      {error && <p className="aviso-error">{error}</p>}
      <button className="boton" disabled={enviando}>{enviando ? "Enviando…" : "Enviar"}</button>
    </form>
  );
}

function Proyecto({ p, equipo, interesados, onRetirar }) {
  const [abierto, setAbierto] = useState(false);
  const [enviado, setEnviado] = useState(false);
  return (
    <article className="tarjeta">
      <h3>{p.titulo}</h3>
      <p className="organo">
        📍 {p.lugar || "Ubicación por concretar"}
        {p.hectareas ? ` · ${p.hectareas} ha` : ""}
        {p.presupuesto ? ` · ${euros(p.presupuesto)}` : ""}
      </p>
      {p.descripcion && <p>{p.descripcion}</p>}

      {enviado ? (
        <p className="frase presenta">¡Gracias! Reforesta se pondrá en contacto contigo.</p>
      ) : abierto ? (
        <FormularioAyuda proyecto={p} onListo={() => setEnviado(true)} />
      ) : (
        <button className="boton" onClick={() => setAbierto(true)}>🌱 Quiero ayudar</button>
      )}

      {equipo && (
        <>
          <h4>Empresas interesadas ({interesados.length})</h4>
          {interesados.length ? (
            <ul className="lista-check">
              {interesados.map((i) => (
                <li key={i.id} className="cumple">
                  <span className="icono">✓</span>
                  <span><b>{i.empresa}</b> · {i.contacto}{i.mensaje ? ` — «${i.mensaje}»` : ""}</span>
                </li>
              ))}
            </ul>
          ) : <p className="organo">Todavía nadie. Comparte el enlace de esta pestaña con empresas.</p>}
          <div className="tarjeta-pie">
            <span />
            <button className="enlace" onClick={() => onRetirar(p.id)}>Retirar proyecto</button>
          </div>
        </>
      )}
    </article>
  );
}

function NuevoProyecto({ onCreado }) {
  const [error, setError] = useState("");
  async function crear(e) {
    e.preventDefault();
    setError("");
    try {
      await api("/proyectos", { metodo: "POST", datos: Object.fromEntries(new FormData(e.target)) });
      e.target.reset();
      onCreado();
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <details className="tarjeta">
      <summary><b>＋ Publicar un proyecto</b></summary>
      <form className="formulario" onSubmit={crear}>
        <input name="titulo" placeholder="Ej.: Reforestar 20 ha quemadas en Guadarrama" required maxLength={150} />
        <input name="lugar" placeholder="Lugar" maxLength={150} />
        <div className="fila">
          <input name="hectareas" type="number" min="0" step="0.1" placeholder="Hectáreas" />
          <input name="presupuesto" type="number" min="0" step="100" placeholder="Presupuesto (€)" />
        </div>
        <textarea name="descripcion" placeholder="Qué se hará, especies, plazos…" maxLength={2000} />
        {error && <p className="aviso-error">{error}</p>}
        <button className="boton">Publicar</button>
      </form>
    </details>
  );
}

export default function Proyectos({ equipo }) {
  const [proyectos, setProyectos] = useState(null);
  const [interesados, setInteresados] = useState([]);
  const [error, setError] = useState("");

  async function cargar() {
    try {
      setProyectos(await api("/proyectos"));
      if (equipo) setInteresados(await api("/interesados"));
    } catch (err) {
      setError(err.message);
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(); }, [equipo]);

  async function retirar(id) {
    if (!confirm("¿Retirar este proyecto? Dejará de verse para las empresas.")) return;
    await api(`/proyectos/${id}`, { metodo: "DELETE" });
    cargar();
  }

  if (error) return <p className="estado">⚠️ {error}</p>;
  if (!proyectos) return <p className="estado">Cargando proyectos…</p>;

  return (
    <section>
      <p className="cobertura">
        Proyectos de restauración de Reforesta que buscan financiación. ¿Tu empresa quiere ayudar?
        Déjanos tu contacto y te escribimos.
      </p>
      {equipo && <NuevoProyecto onCreado={cargar} />}
      {proyectos.length ? proyectos.map((p) => (
        <Proyecto key={p.id} p={p} equipo={equipo} onRetirar={retirar}
          interesados={interesados.filter((i) => i.proyecto_id === p.id)} />
      )) : <p className="estado">Todavía no hay proyectos publicados.</p>}
    </section>
  );
}
