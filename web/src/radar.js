// Estado de la app del equipo: datos del radar (JSON) + estados guardados (API de solicitudes).
// Todas las peticiones pasan por api.js (contraseña X-Clave-Equipo y nombre X-Autor).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorSesion, api } from "./api.js";
import { cargarConvocatorias, cargarEmpresas, etapaDe, modelo, modeloEmpresa } from "./datos.js";

export function useRadar(salir) {
  const [conv, setConv] = useState(null);
  const [emp, setEmp] = useState(null);
  const [sols, setSols] = useState({});     // "convocatoria:923290" -> fila de /api/solicitudes
  const [error, setError] = useState(null);
  const [intento, setIntento] = useState(0);
  const ref = useRef({});                    // copia síncrona de sols (para poder revertir)

  const poner = useCallback((fn) => {
    ref.current = fn(ref.current);
    setSols(ref.current);
  }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        // Primero lo que valida la sesión; luego los datos del radar (el Worker los da solo al equipo).
        const filas = await api("/solicitudes");
        const [c, e] = await Promise.all([cargarConvocatorias(), cargarEmpresas()]);
        if (!vivo) return;
        poner(() => Object.fromEntries(filas.map((r) => [`${r.tipo}:${r.id}`, r])));
        setConv(c);
        setEmp(e);
        setError(null);
      } catch (e) {
        if (!vivo) return;
        if (e instanceof ErrorSesion) salir();
        else setError(e.message);
      }
    })();
    return () => { vivo = false; };
  }, [intento, salir, poner]);

  // Guarda un cambio de estado: se ve al instante y, si el servidor lo rechaza, se revierte.
  const guardar = useCallback(async (tipo, id, cambios) => {
    const k = `${tipo}:${id}`;
    const previa = ref.current[k];
    poner((s) => ({
      ...s,
      [k]: { tipo, id, motivos: [], ...previa, ...cambios, ...(cambios.estado && cambios.estado !== "descartada" ? { motivos: [] } : {}) },
    }));
    try {
      const r = await api(`/solicitudes/${tipo}/${encodeURIComponent(id)}`, { metodo: "PUT", datos: cambios });
      poner((s) => ({ ...s, [k]: r.solicitud }));
      return r.solicitud;
    } catch (e) {
      poner((s) => {
        const n = { ...s };
        if (previa) n[k] = previa; else delete n[k];
        return n;
      });
      if (e instanceof ErrorSesion) salir();
      throw e;
    }
  }, [poner, salir]);

  // Vuelve al estado anterior (POST .../deshacer).
  const deshacer = useCallback(async (tipo, id) => {
    const k = `${tipo}:${id}`;
    try {
      const r = await api(`/solicitudes/${tipo}/${encodeURIComponent(id)}/deshacer`, { metodo: "POST" });
      poner((s) => {
        const n = { ...s };
        if (r.solicitud) n[k] = r.solicitud; else delete n[k];
        return n;
      });
    } catch (e) {
      if (e instanceof ErrorSesion) salir();
      throw e;
    }
  }, [poner, salir]);

  const items = useMemo(
    () => (conv ? conv.convocatorias.map((c) => modelo(c, sols[`convocatoria:${c.codigo}`])) : []),
    [conv, sols],
  );
  const empresas = useMemo(
    () => (emp ? emp.empresas.map((e) => modeloEmpresa(e, sols[`empresa:${e.id}`])) : []),
    [emp, sols],
  );
  const etapas = useMemo(() => {
    const n = { revisar: 0, preparando: 0, presentadas: 0, descartadas: 0 };
    for (const a of items) n[etapaDe(a)]++;
    return n;
  }, [items]);

  return {
    cargado: Boolean(conv), error, reintentar: () => { setError(null); setIntento((n) => n + 1); },
    conv, emp, items, empresas, etapas, guardar, deshacer,
  };
}
