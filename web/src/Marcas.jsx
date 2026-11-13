// Botones "Me interesa / No interesa" (solo para el equipo de Reforesta).
// `estado` es la marca actual ("interesa", "descarta" o undefined).

export default function Marcas({ estado, onMarcar }) {
  if (!onMarcar) return null;  // visitante sin clave del equipo
  const alternar = (valor) => onMarcar(estado === valor ? "" : valor);
  return (
    <div className="marcas">
      <button className={estado === "interesa" ? "on interesa" : ""} onClick={() => alternar("interesa")}>
        ⭐ Me interesa
      </button>
      <button className={estado === "descarta" ? "on descarta" : ""} onClick={() => alternar("descarta")}>
        ✕ No interesa
      </button>
    </div>
  );
}
