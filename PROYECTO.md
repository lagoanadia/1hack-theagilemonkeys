# Radar de convocatorias para Reforesta

Documento autocontenido para pedir ideas y optimizaciones a otra conversación. Incluye el reto, la idea, el funcionamiento principal y lo que queda abierto.

## 1. El reto (hackathon 1hack, The Agile Monkeys)

**Reforesta** es una ONG española con más de 30 años plantando y un equipo de 6 o 7 personas. Trabaja con ayuntamientos, parques regionales y propietarios privados mediante acuerdos de custodia del territorio. Tres líneas: restauración de ecosistemas (charcas, plantación), conservación y mejora de hábitats (tritones, control de ailanto, Guadarrama) y educación ambiental. También tiene un programa agroambiental y proyectos de hábitat de aves con empresas de energía.

**El problema:** cada hectárea que Reforesta planta o recupera la financia una convocatoria pública, una fundación o una empresa. Su capacidad de reforestar depende del dinero que consigue encontrar. Hoy:
- Presenta solo 4 o 5 solicitudes al año.
- Las encuentra en Google o revisando 4 fuentes fijas: MITECO, Fundación Biodiversidad, Comunidad de Madrid (ambiental) y Agenda 2030.
- Saber si una convocatoria encaja obliga a leer decenas de páginas. El tiempo se va ahí, no en escribir la propuesta ni en el monte.
- El canal de empresas (RSC) está a cero: solo les llegan las que las buscan a ellos.
- Cita de Reforesta: "Estoy seguro de que se nos escapan miles."

**La pregunta:** ¿qué construirías para que a Reforesta no se le escape ninguna convocatoria que merezca la pena y pueda restaurar más terreno?

**Reglas:** no hay especificación. Debe atacar el problema real y poder enseñarse el sábado. **No redacta la propuesta:** Reforesta ya sabe escribir; le falta encontrar y priorizar.

**Impacto buscado:** pasar de 4–5 a 10 solicitudes al año con el mismo equipo; 2–4 primeras empresas en el canal RSC; más financiación, más personas contratadas y más terreno restaurado.

**Cómo se elige al ganador:**
1. **El problema:** ¿ataca lo que de verdad le duele, con un ángulo elegido con criterio?
2. **Funciona:** ¿se puede enseñar con convocatorias reales?
3. **El lunes:** ¿Reforesta la abriría y resolvería el problema directamente? ¿Está listo para producción?

**Material dado:** perfil de Reforesta (estatutos, líneas, web), una lista de convocatorias que ya solicitaron o ganaron (con fechas) para validar, las 4 fuentes que ya revisan, y dos convocatorias de ejemplo (Comunidad de Madrid, Orden 1689/2026; MITECO, BDNS 923290). Fuentes públicas sugeridas: BDNS (con API), BOE, BOCM, DOG, Fundación Biodiversidad, MITECO, programa LIFE, Funding & Tenders de la UE, fundaciones privadas y programas de RSC.

**Entrega:** repositorio público de GitHub con README y un vídeo corto. Somos dos personas: un perfil técnico y un perfil de diseño y usabilidad.

## 2. La idea en una frase

Un **radar que traduce la burocracia a lenguaje humano**: busca en la BDNS, lee las bases con IA y dice en un vistazo si Reforesta puede pedir cada convocatoria, cuánto dinero hay y hasta cuándo, para que dediquen las horas a las que merecen la pena. Foco actual: **convocatorias que financian reforestar**.

## 3. Funcionamiento principal

### 3.1 Flujo
1. **Detecta:** un proceso consulta cada día la API de la BDNS (infosubvenciones.es) con términos de reforestación, restauración, conservación y educación ambiental, y trae lo nuevo.
2. **Traduce:** un LLM (Groq) lee las bases de cada convocatoria y devuelve un JSON estructurado y validado: importe, % cubierto, plazo, fecha de resolución, beneficiarios, territorio, requisitos y una frase en lenguaje llano.
3. **Decide:** compara con el perfil de Reforesta (ONG, ámbito, líneas de trabajo, tamaño) y asigna un semáforo: **Presenta / Mira / Descarta**, con el motivo y la cita literal de las bases que lo justifica.
4. **Filtra y prioriza:** la persona ve una lista ordenada por encaje, plazo e importe.
5. **Prepara y sigue:** checklist de documentos (autorrellena los datos fijos de la entidad, nunca escribe la memoria del proyecto) y línea de tiempo hasta la fecha de resolución.

### 3.2 Pantalla de filtrado (Radar), la central
- **Contador de dinero conseguido** por apartado (Reforestación como principal, luego Conservación y Educación), con el reparto por origen: público, fundaciones, empresas.
- **Dinero disponible ahora:** suma de los importes de las convocatorias abiertas que encajan con reforestar.
- **Filtros:** línea de trabajo, semáforo, plazo, importe, ámbito (Madrid, estatal, europeo), tipo de financiador y un interruptor "fuera de mis fuentes habituales" (lo que Reforesta no encontraría con sus 4 fuentes). Orden por encaje, plazo o importe.
- **Ficha por convocatoria:** semáforo y motivo, cifras clave, requisitos con ✓ / ? / ✕ y enlace a las bases originales.
- **Avisos:** "nuevas para ti" y plazos próximos.

### 3.3 Canal de empresas (RSC)
La BDNS solo contiene dinero público. Para fundaciones y empresas hay una pestaña aparte con programas de RSC y ambientales de información pública: semáforo de encaje, tipo de colaboración (convocatoria, voluntariado, patrocinio), enlace al programa y estado de contacto (sin contactar / contactada / en conversación). El botón Contactar abre el canal público de la empresa. Para el sábado serían pocas empresas reales, curadas a mano.

### 3.4 Contrato de datos (una convocatoria analizada)
```json
{
  "id": "string",
  "titulo": "string",
  "organismo": "string",
  "plazo": "YYYY-MM-DD",
  "fecha_resolucion": "YYYY-MM-DD | null",
  "importe": 0,
  "porcentaje_cubierto": 0,
  "semaforo": "verde | amarillo | rojo",
  "puntuacion": 0,
  "motivo": "frase corta",
  "linea_reforesta": "reforestacion | conservacion | educacion",
  "requisitos": [{ "texto": "string", "estado": "cumple | no_cumple | confirmar" }],
  "preparar": ["string"],
  "cita_bases": "string",
  "url": "string",
  "fuera_de_fuentes_habituales": true
}
```

## 4. Decisiones tomadas
- La BDNS es la fuente principal y la única automática el sábado. Cada fuente futura se normaliza al mismo formato, de modo que añadirlas no cambia la interfaz.
- La IA ayuda a leer, filtrar y preparar. No redacta propuestas.
- Resultados precalculados (no se analiza en vivo), para que la demo sea instantánea y estable.
- Web responsive de escritorio. Diseño: fondo blanco, sin degradados, verde y azul, iconos muy redondeados, estética limpia tipo Apple. Logo: una mano con tierra y una planta, como icono.
- Stack previsto: React (Vite), backend ligero con SQLite, Groq para el análisis, despliegue en Vercel. La clave de Groq va en variables de entorno.

## 5. Estado actual
- Hecho: planteamiento, wireframes visuales de las pantallas (Radar con contadores y filtros, Ficha, Seguimiento, Empresas) y un documento de planteamiento en el repositorio.
- Pendiente: integración real con la API de la BDNS y con Groq, backend, validación contra las convocatorias que Reforesta ya ganó, y datos reales de empresas.
- Limitaciones actuales: desde el entorno de desarrollo la red bloquea la API de la BDNS, así que la integración aún no se ha probado. Las cifras del contador de dinero conseguido son de ejemplo porque no tenemos la lista de convocatorias ganadas con sus importes.

## 6. Lo que se le pide a quien lea esto
Quiero convertir esta idea en **la más creativa y diferencial del hackathon**, sin perder el criterio de que funcione con datos reales y esté lista para usarse el lunes. Necesito:
1. **Ideas que eleven la propuesta** y vayan más allá de "buscador con semáforo": ángulos originales que ataquen el problema (se escapan miles de convocatorias, canal RSC a cero, poco tiempo del equipo).
2. **Optimizaciones del funcionamiento:** mejor forma de puntuar el encaje, de detectar convocatorias que no están en la BDNS, de abrir el canal de empresas y de medir el impacto en hectáreas restauradas.
3. **Una demo memorable de 2 minutos** que use convocatorias reales y demuestre el valor (por ejemplo, encontrar algo que Reforesta no tenía en sus 4 fuentes).
4. **Riesgos y puntos débiles** que un jurado detectaría, y cómo cubrirlos.
5. **Qué recortar** para llegar al sábado con dos personas.

Restricciones: no redactar propuestas, usar datos públicos, dos personas, un fin de semana, y la IA vía Groq.
