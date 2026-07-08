# Extractor de Workflows GHL

> 🇬🇧 English version: [README.md](README.md)

Extensión de Chrome (Manifest V3) para exportar los JSON de tus workflows de GoHighLevel
sin tener que abrir DevTools y copiar respuestas una por una.

Funciona en **cualquier instancia de GHL** (GoHighLevel o cualquier white-label), porque el
editor de workflows siempre corre dentro de un iframe de `*.leadconnectorhq.com`.

En vez del proceso manual (DevTools → Network → filtrar Fetch/XHR → recargar → buscar el
endpoint con el ID del workflow → copiar el `response`), la extensión:

1. Captura el token de tu sesión activa (de una petición que el propio GHL ya hace).
2. Muestra tus workflows en un **navegador de carpetas** igual que la página de GHL.
3. Marcas los que quieras (workflow por workflow o carpetas enteras), con buscador.
4. Descarga: **1 workflow → un `.json`**; **varios → un ZIP** con subcarpetas anidadas que
   replican tus carpetas de GHL.

Todo ocurre localmente en tu navegador, con tu propia sesión. No se envía nada a terceros
ni se usan CDNs externos.

## Instalación (modo desarrollador)

1. Abre Chrome y ve a `chrome://extensions`.
2. Activa el **Modo de desarrollador** (arriba a la derecha).
3. Clic en **Cargar descomprimida** y selecciona esta carpeta.
4. (Opcional) Abre las **Opciones** de la extensión y agrega tu dominio de GHL si no es
   `app.gohighlevel.com` (p. ej. tu white-label). Esto solo mejora el reconocimiento de la
   pestaña y el nombre de la sede; la extracción funciona igual sin configurarlo.

## Uso

1. Inicia sesión en tu cuenta de GHL.
2. Abre **cualquier workflow** una vez, o **recarga** la página de un workflow ya abierto.
   Esto hace que la extensión capture el token de tu sesión.
   > Si acabas de instalar la extensión, recarga la pestaña del workflow: las extensiones
   > no se inyectan en pestañas que ya estaban abiertas antes de instalarlas.
3. Haz clic en el icono de la extensión. Verás tus carpetas y workflows.
4. Entra a las carpetas, marca lo que quieras (o carpetas completas) y usa el buscador.
5. Clic en **Descargar seleccionados (N)**:
   - 1 workflow → `Sede - Nombre.json` (o `Nombre.json` si no se detecta la sede).
   - Varios → `Sede - fecha.zip` con un `.json` por workflow, en subcarpetas por carpeta de GHL.

## Configuración

En **Opciones** puedes definir los dominios de GHL (uno por línea) con los que entras a tu
cuenta. Por defecto: `app.gohighlevel.com`. Es opcional: se usa para reconocer la pestaña y
para leer el nombre de la sede/subcuenta desde la propia app.

## Cómo funciona (técnico)

- El editor/lista de workflows corre en un **iframe** de
  `client-app-automation-workflows.leadconnectorhq.com` (constante en toda instancia de GHL).
- El JSON de un workflow:
  `GET https://backend.leadconnectorhq.com/workflow/{locationId}/{workflowId}?includeScheduledPauseInfo=true&sessionId=...`
  con `Authorization: Bearer ...` (+ headers `Version`, `Channel`, `Source`).
- El listado (con jerarquía de carpetas):
  `GET .../workflow/{locationId}/list?limit=&offset=&parentId=`. Los items traen
  `type` (`directory`/`workflow`) y `parentId`.
- `src/inject.js` (mundo de la página del iframe) observa esas peticiones para capturar
  token/headers/sessionId y luego las **re-ejecuta** desde el mismo origen (CORS y auth ya
  resueltos). `src/content.js` hace de puente, `src/background.js` enruta mensajes, y
  `src/popup.js` arma el árbol de carpetas y el ZIP (con `lib/jszip.min.js`, local).
- El nombre de la sede se lee de la pestaña activa vía `chrome.scripting` (permiso
  `activeTab`), como mejor esfuerzo.

## Estructura

```
.
├── manifest.json
├── src/
│   ├── inject.js      # captura token + replay (list / read) en el iframe
│   ├── content.js     # puente page <-> extensión
│   ├── background.js  # service worker: enruta mensajes
│   ├── popup.html / popup.js   # navegador de carpetas, selección, ZIP
│   └── options.html / options.js  # configuración de dominios
├── lib/jszip.min.js   # generación de ZIP (local, sin CDN)
├── icons/
└── README.md
```

## Solución de problemas

- **"No se detecto la sesion todavia"**: abre o recarga un workflow una vez y reintenta.
- **HTTP 401 al descargar**: el token expiró; recarga un workflow y reintenta.
- **La pestaña no se reconoce**: agrega tu dominio de GHL en Opciones.

## Nota

Herramienta de uso personal sobre tus propios datos y tu propia sesión autenticada.
