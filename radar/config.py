"""Configuración del radar: perfil de Reforesta, palabras clave y reglas.

Todo lo que Reforesta podría querer ajustar sin tocar la lógica está aquí.
"""

# Perfil de la ONG. Se lo damos al LLM para que juzgue si una convocatoria encaja.
PERFIL_REFORESTA = """
Reforesta es una ONG española (asociación sin ánimo de lucro) con más de 30 años
de experiencia y un equipo de 6-7 personas. Trabaja sobre todo en la Comunidad de
Madrid (Sierra de Guadarrama) con ayuntamientos, parques regionales y propietarios
privados mediante acuerdos de custodia del territorio. Se financia por hectárea
plantada o restaurada.

Líneas de trabajo:
1. Restauración de ecosistemas: reforestación, plantación de árboles y especies
   autóctonas, creación de charcas para anfibios, restauración tras incendios.
2. Conservación de hábitats: tritones y anfibios, control de especies invasoras
   (ailanto), paisajes de Guadarrama, hábitats para aves (con empresas energéticas).
3. Educación ambiental y voluntariado.
También: programa agroambiental con agricultores.

Lo que NO le sirve: subvenciones nominativas o directas a otra entidad, convenios
ya firmados, ayudas solo para personas físicas o empresas con ánimo de lucro,
cooperación internacional en otros países, investigación pura universitaria,
patrimonio histórico, turismo u hostelería.
"""

# Términos que buscamos en la BDNS. Cada uno es una búsqueda independiente.
TERMINOS_BUSQUEDA = [
    "reforestación",
    "repoblación forestal",
    "forestal",
    "biodiversidad",
    "medio ambiente",
    "medioambiental",
    "restauración ecológica",
    "conservación de la naturaleza",
    "especies invasoras",
    "educación ambiental",
    "voluntariado ambiental",
    "custodia del territorio",
    "humedales",
    "incendios forestales",
    "cambio climático",
    "espacios naturales",
    "red natura",
    "infraestructura verde",
]

# Si el título contiene alguna de estas expresiones, se descarta sin gastar IA.
# (Se comparan en minúsculas y sin tildes.)
DESCARTES_TITULO = [
    "nominativa", "nominada", "nominativo", "subv.nom", "subv nom",
    "convenio", "concesion directa", "subvencion directa", "subvenciones directas",
    "concesion de forma directa", "de concesion directa",
    "convocatoria instrumental",  # cooperación internacional (AECID)
    "trabajos de fin", "trabajos fin de", "tfg", "tfm",
    "anulada", "anulacion",
    "becas", "beca ",
]

# Palabras con peso para el puntuador sin IA (respaldo si no hay GROQ_API_KEY).
PESOS_PALABRAS = {
    "reforest": 30, "repobla": 30, "plantacion": 25, "arbolado": 20,
    "restauracion ecologica": 30, "restauracion de ecosistemas": 30,
    "restauracion forestal": 30, "forestal": 15, "biodiversidad": 20,
    "especies invasoras": 25, "exoticas invasoras": 25, "anfibio": 25,
    "humedal": 20, "charca": 25, "custodia del territorio": 30,
    "educacion ambiental": 20, "voluntariado ambiental": 20, "voluntariado": 8,
    "conservacion": 10, "habitat": 15, "red natura": 20, "espacios naturales": 15,
    "incendio": 15, "medio ambiente": 10, "medioambiental": 10,
    "entidades sin animo de lucro": 15, "sin animo de lucro": 12,
    "tercer sector": 12, "organizaciones no gubernamentales": 12, "ong": 6,
    "madrid": 10, "guadarrama": 25,
}

# Ámbito geográfico: Reforesta trabaja sobre todo en Madrid y puede optar a estatales.
AMBITOS_PREFERENTES = ["ESTADO", "COMUNIDAD DE MADRID", "MADRID"]

# Filtro geográfico (sin IA). La BDNS da las regiones con códigos NUTS:
# "ES" = toda España, "ES3"/"ES30"/"ES300" = Comunidad de Madrid.
# Una convocatoria pasa si alguna de sus regiones empieza por uno de estos códigos.
# Si Reforesta empieza a trabajar en otra comunidad, se añade aquí (p. ej. "ES41" Castilla y León).
REGIONES_VALIDAS = ["ES3"]
REGION_NACIONAL = "ES"  # código exacto que usa la BDNS para "ES - ESPAÑA"

# Tipo de beneficiario de Reforesta en la BDNS. Si la convocatoria indica beneficiarios
# y ninguno es de este tipo (solo personas físicas, pymes, gran empresa), se descarta.
BENEFICIARIOS_VALIDOS = ["personas juridicas que no desarrollan actividad economica",
                         "sin informacion"]

# ---------------------------------------------------------------- Groq
# Cascada: un modelo pequeño y barato hace la criba; el grande solo analiza lo que pasa.
# Groq retira modelos a menudo, así que damos listas de preferencia: al arrancar se
# pregunta a Groq qué modelos hay y se usa el primero disponible de cada lista.
# Para forzar uno concreto: variables de entorno GROQ_MODELO_CRIBA / GROQ_MODELO_DECISION.
MODELOS_CRIBA = ["openai/gpt-oss-20b", "llama-3.1-8b-instant", "meta-llama/llama-4-scout-17b-16e-instruct"]
MODELOS_DECISION = ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "moonshotai/kimi-k2-instruct"]
UMBRAL_CRIBA = 40          # puntuación mínima del modelo pequeño para pasar al grande
PAUSA_ENTRE_LLAMADAS = 2   # segundos; el SDK además espera lo que diga Groq (retry-after)

# Veredicto a partir de la puntuación (mismos cortes que usa la web).
UMBRAL_PRESENTA = 70
UMBRAL_MIRA = 50

# Cuántos días hacia atrás miramos por defecto.
DIAS_POR_DEFECTO = 90
