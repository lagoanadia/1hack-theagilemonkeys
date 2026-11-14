import { useEffect, useRef, useState } from "react";

// Lista con scroll interno sin barra del sistema.
// A la derecha, una pista fina con una "burbuja" que baja mientras se hace scroll
// y dice qué elementos se están viendo ("1–3 de 5"). Abajo, un difuminado que
// indica que hay más contenido (desaparece al llegar al final).
//
// Uso:
//   <ScrollConBurbuja alto={440} total={items.length} porVista={3}>
//     {items.map((c) => <FilaDecision key={c.codigo} c={c} />)}
//   </ScrollConBurbuja>

export default function ScrollConBurbuja({ alto = 440, total, porVista = 3, children }) {
  const caja = useRef(null);
  const [pos, setPos] = useState({ arriba: 0, tam: 1, final: false });

  function medir() {
    const el = caja.current;
    if (!el) return;
    const tam = Math.min(1, el.clientHeight / el.scrollHeight);
    const recorrido = el.scrollHeight - el.clientHeight;
    const arriba = recorrido > 0 ? (el.scrollTop / recorrido) * (1 - tam) : 0;
    setPos({ arriba, tam, final: el.scrollTop >= recorrido - 2 });
  }

  useEffect(() => {
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [total]);

  const hayScroll = pos.tam < 1;
  // Qué elementos se ven ahora mismo (aproximado por la posición del scroll).
  const primero = Math.min(total - porVista, Math.round((pos.arriba / Math.max(1 - pos.tam, 0.001)) * (total - porVista))) + 1;
  const rango = `${Math.max(1, primero)}–${Math.min(total, primero + porVista - 1)} de ${total}`;

  return (
    <div style={{ position: "relative", height: alto }}>
      <div ref={caja} onScroll={medir} className="scroll-sin-barra"
        style={{ height: "100%", overflowY: "auto", paddingRight: hayScroll ? 34 : 0 }}>
        {children}
      </div>

      {hayScroll && !pos.final && (
        <div aria-hidden="true" style={{
          position: "absolute", left: 0, right: 0, bottom: 0, height: 70, pointerEvents: "none",
          background: "linear-gradient(rgba(255,255,255,0), #fff)",
        }} />
      )}

      {hayScroll && (
        <div aria-hidden="true" style={{ position: "absolute", right: 4, top: 8, bottom: 8, width: 4, borderRadius: 2, background: "rgba(22,32,27,.06)" }}>
          <div style={{
            position: "absolute", left: 0, width: 4, borderRadius: 2, background: "#1F4D2E",
            top: `${pos.arriba * 100}%`, height: `${pos.tam * 100}%`, transition: "top .08s linear",
          }} />
          <div style={{
            position: "absolute", right: 12, top: `calc(${(pos.arriba + pos.tam / 2) * 100}% - 13px)`,
            background: "#16201B", color: "#fff", font: '500 11.5px "Archivo", sans-serif',
            padding: "5px 9px", borderRadius: 999, whiteSpace: "nowrap", transition: "top .08s linear",
            boxShadow: "0 8px 18px -8px rgba(0,0,0,.45)",
          }}>{rango}</div>
        </div>
      )}
    </div>
  );
}

/* En el CSS global, para ocultar la barra del sistema:
.scroll-sin-barra { scrollbar-width: none; }
.scroll-sin-barra::-webkit-scrollbar { display: none; }
*/
