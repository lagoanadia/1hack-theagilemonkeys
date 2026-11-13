# 🌱 Radar de convocatorias para Reforesta

> 1hack A Coruña · Reto Reforesta: *que no se escape ninguna convocatoria que merezca la pena.*

Reforesta presenta 4-5 solicitudes al año porque **encontrar y leer** convocatorias le come
el tiempo al equipo. Este radar hace ese trabajo cada mañana:

1. **Recolecta** todas las convocatorias recientes de la **BDNS** (Base de Datos Nacional de
   Subvenciones), donde se publican por ley las ayudas públicas de toda España: Estado,
   comunidades autónomas, diputaciones y ayuntamientos.
2. **Filtra** lo que seguro no sirve: subvenciones nominativas, convenios, concesiones
   directas, convocatorias no competitivas y plazos cerrados.
3. **Puntúa** de 0 a 100 cada superviviente con un LLM (Groq) que lee el texto oficial y
   lo compara con el perfil de Reforesta. Explica el motivo, resume y avisa de requisitos.
4. **Publica** una web con la lista ordenada por encaje y plazo.

Reforesta no redacta nada nuevo ni instala nada: abre una web y ve qué merece la pena esta semana.

## Arquitectura

```
GitHub Actions (cada día)
   └─ python -m radar
        ├─ bdns.py       → API pública de infosubvenciones.es
        ├─ filtros.py    → reglas baratas (sin IA)
        ├─ puntuador.py  → Groq (o palabras clave si no hay API key)
        └─ escribe web/public/data/convocatorias.json
Cloudflare Workers (cada push)
   └─ web/  → app React (Vite) que lee el JSON y lo muestra
```

No hay servidor ni base de datos: coste 0 €. El JSON hace de caché, así que cada día
solo se gasta IA en las convocatorias nuevas.

## Uso local

```bash
pip install -r requirements.txt
export GROQ_API_KEY=gsk_...      # opcional: sin ella se usa el modo palabras clave
python -m radar --dias 90
cd web && npm install && npm run dev     # abrir http://localhost:5173
```

Opciones: `--dias N` (ventana de búsqueda), `--sin-ia`, `--recalcular` (ignorar caché).
Los modelos de Groq se eligen solos (ver `MODELOS_CRIBA` y `MODELOS_DECISION` en `radar/config.py`); para forzar uno: `GROQ_MODELO_CRIBA` / `GROQ_MODELO_DECISION`.

## Puesta en producción (5 minutos)

1. **GitHub → Settings → Secrets and variables → Actions** → nuevo secreto `GROQ_API_KEY`.
2. **Cloudflare → Workers → Import a repository** → este repo.
   Build command: `cd web && npm ci && npm run build`.
   Deploy command: `npx wrangler deploy` (lee [`wrangler.jsonc`](wrangler.jsonc), que sirve `web/dist`).
3. **GitHub → Actions → Radar diario → Run workflow** para la primera ejecución.
   Cada push del workflow redespliega Cloudflare automáticamente.

## Personalizar

Todo lo ajustable está en [`radar/config.py`](radar/config.py): perfil de la ONG, términos de
búsqueda, descartes y pesos de palabras clave.

## Siguientes pasos

- Validar con el histórico de convocatorias que Reforesta ya pidió o ganó.
- Más fuentes: Fundación Biodiversidad, LIFE (UE), fundaciones privadas y RSC.
- Aviso semanal por email con las nuevas recomendadas.
- Calendario de convocatorias recurrentes ("suele salir en marzo").
