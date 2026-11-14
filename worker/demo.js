// Datos SIMULADOS para el modo demo (funciones: en un Worker Date.now() vale 0 al cargar el módulo): rellenan todas las pantallas para enseñar y pulir la web.
// Las convocatorias y empresas llevan `simulada: true` (además de `demo: true`) y sin enlace oficial.
// Se apagan con PUT /api/demo {activo:false}, que también borra lo sembrado en D1.

const dia = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const DOCS_COMUNES = [
  { nombre: "Solicitud de subvención (Anexo I)", tipo: "solicitud", obligatorio: true, condicion: "", antiguedad_max_meses: null, cita: "Solicitud según el modelo del Anexo I, firmada por el representante legal" },
  { nombre: "Estatutos de la entidad", tipo: "estatutos", obligatorio: true, condicion: "", antiguedad_max_meses: null, cita: "Copia de los estatutos debidamente inscritos" },
  { nombre: "Tarjeta de identificación fiscal (CIF)", tipo: "cif", obligatorio: true, condicion: "", antiguedad_max_meses: null, cita: "Copia de la tarjeta de identificación fiscal de la entidad" },
  { nombre: "Certificado de estar al corriente con Hacienda", tipo: "cert_hacienda", obligatorio: true, condicion: "", antiguedad_max_meses: 6, cita: "Certificado de la AEAT de estar al corriente de las obligaciones tributarias" },
  { nombre: "Certificado de estar al corriente con la Seguridad Social", tipo: "cert_seg_social", obligatorio: true, condicion: "", antiguedad_max_meses: 6, cita: "Certificado de la TGSS de estar al corriente de las obligaciones con la Seguridad Social" },
  { nombre: "Memoria técnica del proyecto", tipo: "memoria_proyecto", obligatorio: true, condicion: "", antiguedad_max_meses: null, cita: "Memoria descriptiva del proyecto según el Anexo II" },
  { nombre: "Presupuesto detallado", tipo: "presupuesto", obligatorio: true, condicion: "", antiguedad_max_meses: null, cita: "Presupuesto desglosado por partidas" },
  { nombre: "Declaración responsable", tipo: "declaracion_responsable", obligatorio: true, condicion: "", antiguedad_max_meses: null, cita: "Declaración responsable de no estar incursa en las prohibiciones del artículo 13 de la Ley 38/2003" },
  { nombre: "Autorización del propietario del terreno", tipo: "permiso_propietario", obligatorio: false, condicion: "si la actuación es en terreno ajeno", antiguedad_max_meses: null, cita: "Autorización expresa de la persona titular de los terrenos" },
];

function conv(c) {
  return {
    ambito: "ESTADO", inicio: null, abierta: true, plazo_estimado: null, plazo_texto: "Simulada para la demo",
    tipo: "Concurrencia competitiva - canónica", url: "", url_bases: "", sede: "", encaja: c.veredicto !== "descarta",
    requisitos_clave: "", metodo: "simulada", plantillas: [], documentos_requeridos: DOCS_COMUNES, demo: true, simulada: true,
    ...c,
  };
}

export const convocatoriasSim = () => [
  conv({ codigo: "SIM-01", titulo: "Ayudas para la restauración de zonas forestales afectadas por incendios en la Comunidad de Madrid", organo: "COMUNIDAD DE MADRID · Consejería de Medio Ambiente", ambito: "COMUNIDAD DE MADRID",
    publicada: dia(0), fin: dia(12), presupuesto: 2500000, puntuacion: 92, veredicto: "presenta", linea: "restauracion",
    resumen: "Financia la reforestación con especies autóctonas de terrenos quemados en los últimos cinco años.",
    motivo: "Es exactamente lo que hace Reforesta: plantar tras incendios en la Comunidad de Madrid, y admite asociaciones sin ánimo de lucro.",
    requisitos: [{ texto: "Entidad sin ánimo de lucro", estado: "cumple" }, { texto: "Actuación en la Comunidad de Madrid", estado: "cumple" }, { texto: "Especies autóctonas", estado: "cumple" }, { texto: "Al corriente de pagos", estado: "duda" }],
    cita: "Podrán ser beneficiarias las entidades sin ánimo de lucro que ejecuten actuaciones de restauración forestal", porcentaje_financiado: 100, importe_max: 150000 }),
  conv({ codigo: "SIM-02", titulo: "Subvenciones a entidades del Tercer Sector para la restauración de riberas y ecosistemas fluviales", organo: "MINISTERIO PARA LA TRANSICIÓN ECOLÓGICA Y EL RETO DEMOGRÁFICO",
    publicada: dia(-2), fin: dia(26), presupuesto: 4000000, puntuacion: 85, veredicto: "presenta", linea: "restauracion",
    resumen: "Proyectos de plantación de bosque de ribera y renaturalización de cauces.",
    motivo: "Restauración con plantación de especies autóctonas; Reforesta encaja como entidad del Tercer Sector.",
    requisitos: [{ texto: "Entidad del Tercer Sector", estado: "cumple" }, { texto: "Cofinanciar el 20 %", estado: "duda" }, { texto: "Ámbito estatal o autonómico", estado: "cumple" }],
    cita: "proyectos de restauración de la vegetación de ribera mediante plantación de especies autóctonas", porcentaje_financiado: 80, importe_max: 90000 }),
  conv({ codigo: "SIM-03", titulo: "Convocatoria para la conservación de anfibios y la creación de charcas temporales", organo: "FUNDACIÓN BIODIVERSIDAD",
    publicada: dia(0), fin: dia(19), presupuesto: 800000, puntuacion: 74, veredicto: "mira", linea: "conservacion",
    resumen: "Creación y mejora de charcas para anfibios y seguimiento de poblaciones.",
    motivo: "Encaja con la línea de charcas para anfibios, pero exige cofinanciar un 30 % y un técnico con experiencia acreditada.",
    requisitos: [{ texto: "Sin ánimo de lucro", estado: "cumple" }, { texto: "Cofinanciar el 30 %", estado: "duda" }, { texto: "Técnico con experiencia en anfibios", estado: "duda" }],
    cita: "actuaciones de creación, restauración y mejora de puntos de agua para anfibios", porcentaje_financiado: 70, importe_max: 60000 }),
  conv({ codigo: "SIM-04", titulo: "Programa de educación ambiental y voluntariado en espacios naturales", organo: "AYUNTAMIENTO DE MADRID · Área de Medio Ambiente", ambito: "LOCAL",
    publicada: dia(-4), fin: dia(33), presupuesto: 300000, puntuacion: 81, veredicto: "presenta", linea: "educacion",
    resumen: "Jornadas de plantación con voluntariado y actividades educativas en parques.",
    motivo: "Educación ambiental y voluntariado son una línea de Reforesta y el ámbito es Madrid.",
    requisitos: [{ texto: "Entidad inscrita en el registro municipal", estado: "duda" }, { texto: "Actividades en Madrid", estado: "cumple" }],
    cita: "programas de voluntariado ambiental que incluyan jornadas de plantación", porcentaje_financiado: 100, importe_max: 25000 }),
  conv({ codigo: "SIM-05", titulo: "Ayudas a proyectos de custodia del territorio con agricultores y ganaderos", organo: "JUNTA DE CASTILLA Y LEÓN · Consejería de Medio Ambiente", ambito: "CASTILLA Y LEÓN",
    publicada: dia(-6), fin: dia(5), presupuesto: 1200000, puntuacion: 66, veredicto: "mira", linea: "agroambiental",
    resumen: "Acuerdos de custodia con agricultores para setos, linderos y bosquetes.",
    motivo: "Encaja con el programa agroambiental, pero quedan 5 días y hay que confirmar si admiten entidades con sede fuera de Castilla y León.",
    requisitos: [{ texto: "Sede o delegación en Castilla y León", estado: "duda" }, { texto: "Acuerdos de custodia firmados", estado: "cumple" }],
    cita: "entidades de custodia del territorio que suscriban acuerdos con titulares de explotaciones", porcentaje_financiado: 75, importe_max: 40000 }),
  conv({ codigo: "SIM-06", titulo: "Control de especies exóticas invasoras en la Sierra de Guadarrama", organo: "PARQUE NACIONAL DE LA SIERRA DE GUADARRAMA",
    publicada: dia(-1), fin: dia(41), presupuesto: 500000, puntuacion: 62, veredicto: "mira", linea: "conservacion",
    resumen: "Eliminación de ailanto y otras invasoras con restauración posterior.",
    motivo: "Reforesta ya controla ailanto en Guadarrama; falta confirmar si es una ayuda o un contrato menor.",
    requisitos: [{ texto: "Experiencia en control de invasoras", estado: "cumple" }, { texto: "Solvencia técnica acreditada", estado: "duda" }],
    cita: "actuaciones de control y erradicación de Ailanthus altissima", porcentaje_financiado: 100, importe_max: 30000 }),
  conv({ codigo: "SIM-07", titulo: "Restauración de ecosistemas y renaturalización: proyectos de entidades sin ánimo de lucro", organo: "MINISTERIO PARA LA TRANSICIÓN ECOLÓGICA Y EL RETO DEMOGRÁFICO",
    publicada: dia(-3), fin: dia(18), presupuesto: 20000000, puntuacion: 88, veredicto: "presenta", linea: "restauracion",
    resumen: "Grandes proyectos de restauración ecológica y conectividad, con plantación.",
    motivo: "Importe alto y objeto muy alineado: restauración con plantación por entidades sin ánimo de lucro.",
    requisitos: [{ texto: "Entidad sin ánimo de lucro", estado: "cumple" }, { texto: "Proyecto de al menos 10 ha", estado: "cumple" }, { texto: "Aval del 5 %", estado: "no" }],
    cita: "proyectos de restauración de ecosistemas degradados promovidos por entidades sin ánimo de lucro", porcentaje_financiado: 90, importe_max: 300000 }),
  conv({ codigo: "SIM-08", titulo: "Subvenciones para la mejora de la eficiencia energética en pymes industriales", organo: "MINISTERIO DE INDUSTRIA Y TURISMO",
    publicada: dia(-2), fin: dia(30), presupuesto: 15000000, puntuacion: 12, veredicto: "descarta", linea: "restauracion",
    resumen: "Ayudas a empresas para renovar equipos industriales.", motivo: "Solo para empresas con ánimo de lucro.",
    requisitos: [{ texto: "Ser pyme industrial", estado: "no" }], cita: "", porcentaje_financiado: 40, importe_max: 200000 }),
  conv({ codigo: "SIM-09", titulo: "Ayudas para proyectos de reforestación con cofinanciación del 50 %", organo: "DIPUTACIÓN PROVINCIAL DE TOLEDO", ambito: "LOCAL",
    publicada: dia(-8), fin: dia(22), presupuesto: 600000, puntuacion: 58, veredicto: "mira", linea: "restauracion",
    resumen: "Reforestación en la provincia de Toledo con la mitad del coste a cargo de la entidad.", motivo: "Encaja, pero hay que poner la mitad del dinero.",
    requisitos: [{ texto: "Cofinanciar el 50 %", estado: "duda" }], cita: "", porcentaje_financiado: 50, importe_max: 50000 }),
  conv({ codigo: "SIM-10", titulo: "Programa de restauración de dehesas con aportación de la entidad del 40 %", organo: "JUNTA DE EXTREMADURA", ambito: "EXTREMADURA",
    publicada: dia(-9), fin: dia(15), presupuesto: 900000, puntuacion: 55, veredicto: "mira", linea: "agroambiental",
    resumen: "Regeneración de arbolado en dehesas.", motivo: "Encaja en parte; piden aportar el 40 %.",
    requisitos: [{ texto: "Cofinanciar el 40 %", estado: "duda" }], cita: "", porcentaje_financiado: 60, importe_max: 70000 }),
  conv({ codigo: "SIM-11", titulo: "Subvención para revegetación de taludes en carreteras provinciales", organo: "DIPUTACIÓN PROVINCIAL DE GUADALAJARA", ambito: "LOCAL",
    publicada: dia(-10), fin: dia(9), presupuesto: 400000, puntuacion: 52, veredicto: "mira", linea: "restauracion",
    resumen: "Revegetación de taludes con especies autóctonas.", motivo: "Encaja, pero hay que cofinanciar un 35 %.",
    requisitos: [{ texto: "Cofinanciar el 35 %", estado: "duda" }], cita: "", porcentaje_financiado: 65, importe_max: 35000 }),
];

export const empresasSim = () => [
  { id: "SIM-E1", fecha: dia(-1), titulo: "Declaración de impacto ambiental del parque fotovoltaico «Sol de Aranjuez» (simulada)", url: "",
    promotor: "Solar Tajo Energía, SL", proyecto: "Parque fotovoltaico Sol de Aranjuez", tipo: "solar", ubicacion: "Aranjuez, Comunidad de Madrid",
    medidas: [{ texto: "Plantación de 12 ha de encinar y coscojar como medida compensatoria", superficie_ha: 12 }, { texto: "Creación de dos charcas para anfibios", superficie_ha: null }],
    superficie_total_ha: 12, encaje: 91, accion: "contactar", resumen: "Solar Tajo Energía debe plantar 12 ha de encinar en Aranjuez por su parque fotovoltaico.",
    cita: "el promotor ejecutará la plantación de 12 ha de encinar como medida compensatoria", metodo: "simulada", demo: true, simulada: true },
  { id: "SIM-E2", fecha: dia(-3), titulo: "Declaración de impacto ambiental del parque eólico «Altos de Somosierra» (simulada)", url: "",
    promotor: "Eólica Sierra Norte, SA", proyecto: "Parque eólico Altos de Somosierra", tipo: "eolico", ubicacion: "Somosierra, Comunidad de Madrid",
    medidas: [{ texto: "Revegetación de taludes y zonas de obra con especies autóctonas", superficie_ha: 6 }, { texto: "Restauración de 4 ha de pinar", superficie_ha: 4 }],
    superficie_total_ha: 10, encaje: 86, accion: "contactar", resumen: "Eólica Sierra Norte debe revegetar 10 ha en Somosierra por su parque eólico.",
    cita: "se restaurarán 4 ha de pinar en el entorno del parque", metodo: "simulada", demo: true, simulada: true },
  { id: "SIM-E3", fecha: dia(-5), titulo: "Declaración de impacto ambiental de la línea eléctrica «Segovia–Madrid Norte» (simulada)", url: "",
    promotor: "Red de Transporte Centro, SA", proyecto: "Línea eléctrica Segovia–Madrid Norte 400 kV", tipo: "linea_electrica", ubicacion: "Segovia y Comunidad de Madrid",
    medidas: [{ texto: "Plantación compensatoria de arbolado en 8 ha", superficie_ha: 8 }],
    superficie_total_ha: 8, encaje: 78, accion: "contactar", resumen: "Red de Transporte Centro debe plantar 8 ha de arbolado entre Segovia y Madrid.",
    cita: "plantación compensatoria equivalente a 8 ha", metodo: "simulada", demo: true, simulada: true },
];

// Estados que se siembran en D1 (todo con autor "Demo" para poder borrarlo).
export const solicitudesSim = () => [
  ["convocatoria", "SIM-07", { estado: "preparando" }],
  ["convocatoria", "SIM-01", { estado: "preparando" }],
  ["convocatoria", "SIM-02", { estado: "presentada" }],
  ["convocatoria", "SIM-04", { estado: "concedida" }],
  ["convocatoria", "SIM-03", { estado: "subsanar", fecha_paso: dia(2), siguiente_paso: "Entregar el certificado de la Seguridad Social" }],
  ["convocatoria", "923290", { estado: "justificar" }],
  ["convocatoria", "904719", { estado: "plantar" }],
  ["convocatoria", "SIM-06", { estado: "mas_tarde" }],
  ["convocatoria", "SIM-09", { estado: "descartada", motivos: ["Piden poner mucho dinero"], nota: "Pueden poner como máximo el 20 %" }],
  ["convocatoria", "SIM-10", { estado: "descartada", motivos: ["Piden poner mucho dinero"], nota: "Pueden poner como máximo el 20 %" }],
  ["convocatoria", "SIM-11", { estado: "descartada", motivos: ["Piden poner mucho dinero", "Plazo muy corto"], nota: "Pueden poner como máximo el 25 %" }],
  ["convocatoria", "SIM-08", { estado: "descartada", motivos: ["No es reforestación"] }],
  ["empresa", "SIM-E2", { estado: "contactada" }],
  ["empresa", "SIM-E3", { estado: "reunion" }],
];

export const PROYECTOS_SIM = [
  { titulo: "Bosque tras el incendio de Valdemorillo", lugar: "Valdemorillo (Madrid)", tipo: "plantacion", incluye: "Planta, plantación, riego el primer verano y fotos", descripcion: "Recuperar con encinas y quejigos una ladera quemada en 2025.", hectareas: 15, presupuesto: 30000, plazas: 3, estado: "publicada" },
  { titulo: "Charcas para anfibios en Guadarrama", lugar: "Cercedilla (Madrid)", tipo: "restauracion", incluye: "Excavación, impermeabilización natural y seguimiento", descripcion: "Seis charcas temporales para sapo partero y tritón jaspeado.", hectareas: 2, presupuesto: 9000, plazas: 2, estado: "publicada" },
  { titulo: "Jornada de plantación con vuestro equipo", lugar: "Soto del Real (Madrid)", tipo: "voluntariado", incluye: "Herramientas, monitores y almuerzo", descripcion: "Una mañana plantando con la plantilla: 1 ha y 400 árboles.", hectareas: 1, presupuesto: 4500, plazas: 6, estado: "publicada" },
  { titulo: "Sotos del Manzanares", lugar: "Manzanares el Real (Madrid)", tipo: "restauracion", incluye: "Bosque de ribera", descripcion: "En preparación.", hectareas: 5, presupuesto: 18000, plazas: null, estado: "borrador" },
];
// Reservas: índice de la propuesta, empresa, contacto, hectáreas, estado
export const RESERVAS_SIM = [
  [0, "Verde Logística, SL", "Lucía Martín · rsc@verdelogistica.example", 8, "confirmada"],
  [0, "Banco Ejemplo", "Carlos Ruiz · sostenibilidad@bancoejemplo.example", 4, "contestada"],
  [1, "Cafés del Norte", "Ana Gil · ana@cafesdelnorte.example", 1, "nueva"],
  [2, "Software Sierra", "Pablo Díaz · personas@softwaresierra.example", null, "nueva"],
];
export const PLANTACIONES_SIM = [
  { nombre: "Ladera quemada de Valdemorillo", ll: [-4.07, 40.50], ha: 6, arboles: 4800, especies: "encina, quejigo", tipo: "c", anio: 2026, con: "Comunidad de Madrid" },
  { nombre: "Charcas de Cercedilla", ll: [-4.06, 40.74], ha: 1.5, arboles: 300, especies: "fresno, sauce", tipo: "c", anio: 2025, con: "Fundación Biodiversidad" },
  { nombre: "Soto de Soto del Real", ll: [-3.78, 40.75], ha: 2, arboles: 900, especies: "fresno, chopo, sauce", tipo: "e", anio: 2025, con: "Verde Logística, SL" },
  { nombre: "Dehesa de Colmenar Viejo", ll: [-3.77, 40.66], ha: 4, arboles: 1600, especies: "encina, enebro", tipo: "e", anio: 2024, con: "Banco Ejemplo" },
  { nombre: "Pinar de Rascafría", ll: [-3.88, 40.90], ha: 3, arboles: 2400, especies: "pino silvestre, roble melojo", tipo: "v", anio: 2024, con: "Voluntariado" },
  { nombre: "Riberas del Manzanares", ll: [-3.87, 40.72], ha: 2.5, arboles: 1100, especies: "fresno, aliso", tipo: "c", anio: 2023, con: "MITECO" },
  { nombre: "Cerro de Guadarrama", ll: [-4.01, 40.67], ha: 5, arboles: 4000, especies: "roble melojo, serbal", tipo: "v", anio: 2022, con: "Voluntariado" },
];
// Biblioteca: [nombre, tipo, emitido (días desde hoy), caduca (días desde hoy) o null]
export const DOCUMENTOS_SIM = [
  ["Estatutos de Reforesta", "estatutos", -3000, null],
  ["CIF de la asociación", "cif", -3000, null],
  ["Certificado de Hacienda", "cert_hacienda", -160, 20],
  ["Certificado de la Seguridad Social", "cert_seg_social", -190, -10],
  ["Memoria de actividades 2025", "memoria_actividades", -120, null],
  ["Cuentas anuales 2025", "cuentas_anuales", -100, null],
  ["Declaración responsable firmada", "declaracion_responsable", -20, null],
];
export const diaDemo = dia;
