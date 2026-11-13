import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";

// Botón oficial "Iniciar sesión con Google" (Google Identity Services).
// El Client ID lo da el backend (/api/config), así se cambia en Cloudflare sin recompilar.

let scriptGoogle;
function cargarGoogle() {
  scriptGoogle ??= new Promise((ok, fallo) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = ok;
    s.onerror = () => fallo(new Error("No se pudo cargar el login de Google"));
    document.head.appendChild(s);
  });
  return scriptGoogle;
}

export default function LoginGoogle({ onToken }) {
  const caja = useRef(null);
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const { google_client_id: clientId } = await api("/config", { token: "" });
        if (!clientId) return setAviso("Login no configurado");
        await cargarGoogle();
        if (!vivo || !caja.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (r) => onToken(r.credential),
        });
        window.google.accounts.id.renderButton(caja.current, {
          theme: "outline", size: "medium", text: "signin", shape: "pill", locale: "es",
        });
      } catch (e) {
        if (vivo) setAviso(e.message);
      }
    })();
    return () => { vivo = false; };
  }, [onToken]);

  return aviso ? <span className="actualizado">{aviso}</span> : <div ref={caja} />;
}
