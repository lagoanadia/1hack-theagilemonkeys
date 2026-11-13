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

# Barrido de la BDNS: en vez de buscar palabras en el título (se escapaban convocatorias
# como "PROYECTOS AMBIENTALES"), pedimos TODAS las convocatorias de estas regiones y
# filtramos después leyendo la ficha. Ids de la API de la BDNS:
# 1 = ES (toda España), 25 = ES3, 26 = ES30, 27 = ES300 (Comunidad de Madrid).
REGIONES_BDNS = "1,25,26,27"

# Puntos mínimos de palabras clave (PESOS_PALABRAS) en la ficha completa para que una
# convocatoria se considere "de temática ambiental" y pase a Groq. Barato y sin IA.
UMBRAL_RELEVANCIA = 10  # basta una palabra ambiental clara ("medio ambiente"); el resto lo criba Groq
# Palabras que suman en la puntuación sin IA pero NO indican temática ambiental
# (tipo de entidad o lugar). No cuentan para UMBRAL_RELEVANCIA.
NO_TEMATICAS = {"entidades sin animo de lucro", "sin animo de lucro", "tercer sector",
                "organizaciones no gubernamentales", "ong", "madrid", "voluntariado"}

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
    "ambiental": 15, "ecosistema": 15, "naturaleza": 10, "fauna": 10, "flora": 10,
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

# Beneficiarios: la BDNS a menudo los etiqueta mal (la 923290 de MITECO, a la que se
# presentó Reforesta, figura solo para "personas físicas"). Por eso solo descartamos
# las convocatorias cuyos beneficiarios son ÚNICAMENTE empresas.
BENEFICIARIOS_SOLO_EMPRESA = ["pyme y personas fisicas que desarrollan actividad economica",
                              "gran empresa"]

# ---------------------------------------------------------------- Groq
# Cascada: un modelo pequeño y barato hace la criba; el grande solo analiza lo que pasa.
# Groq retira modelos a menudo, así que damos listas de preferencia: al arrancar se
# pregunta a Groq qué modelos hay y se usa el primero disponible de cada lista.
# Para forzar uno concreto: variables de entorno GROQ_MODELO_CRIBA / GROQ_MODELO_DECISION.
MODELOS_CRIBA = ["openai/gpt-oss-20b", "llama-3.1-8b-instant", "meta-llama/llama-4-scout-17b-16e-instruct"]
MODELOS_DECISION = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "moonshotai/kimi-k2-instruct"]
UMBRAL_CRIBA = 40          # puntuación mínima del modelo pequeño para pasar al grande
PAUSA_ENTRE_LLAMADAS = 2   # segundos; el SDK además espera lo que diga Groq (retry-after)

# Veredicto a partir de la puntuación (mismos cortes que usa la web).
UMBRAL_PRESENTA = 70
UMBRAL_MIRA = 50

# Cuántos días hacia atrás miramos por defecto.
DIAS_POR_DEFECTO = 365  # hay convocatorias abiertas meses después de publicarse
