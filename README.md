# Extractor de Workflows GHL

Extensión de Chrome (Manifest V3) para exportar los JSON de tus workflows de GoHighLevel
sin tener que abrir DevTools y copiar respuestas una por una.

En vez del proceso manual (DevTools → Network → filtrar Fetch/XHR → recargar → buscar el
endpoint con el ID del workflow → copiar el `response`), la extensión:

1. Captura el token de tu sesión activa (de una petición que el propio GHL ya hace).
2. Lista **todos** los workflows de la ubicación en un popup.
3. Tú marcas los que quieras (con buscador y "seleccionar todos").
4. Descarga los JSON seleccionados en un **ZIP**, un archivo por workflow.

Todo ocurre localmente en tu navegador, con tu propia sesión. No se envía nada a terceros
ni se usan CDNs externos.

## Instalación (modo desarrollador)

1. Abre Chrome y ve a `chrome://extensions`.
2. Activa el **Modo de desarrollador** (arriba a la derecha).
3. Clic en **Cargar descomprimida** y selecciona esta carpeta (`extractor_wf_ghl`).
4. La extensión aparecerá en la barra. Ánclala si quieres para tenerla a mano.

## Uso

1. Inicia sesión en tu cuenta (`https://app.gohighlevel.com`).
2. Abre **cualquier workflow** una vez, o **recarga** la página de un workflow ya abierto.
   Esto hace que la extensión capture el token de tu sesión.
   > Si acabas de instalar la extensión, recarga la pestaña del workflow: las extensiones
   > no se inyectan en pestañas que ya estaban abiertas antes de instalarlas.
3. Haz clic en el icono de la extensión. Verás la lista de todos los workflows.
4. Marca los que quieras (usa el buscador o "Todos" / "Ninguno").
5. Clic en **Descargar seleccionados (N)**. Se genera y descarga un ZIP
   `workflows-{locationId}-{fecha}.zip` con un `.json` por workflow (organizados por
   carpeta si el workflow está dentro de una).

## Cómo funciona (técnico)

- El editor de workflows de GHL corre en un **iframe** de
  `client-app-automation-workflows.leadconnectorhq.com` dentro de `app.gohighlevel.com`.
- El JSON completo de un workflow se obtiene con
  `GET https://backend.leadconnectorhq.com/workflow/{locationId}/{workflowId}?includeScheduledPauseInfo=true&sessionId=...`
  usando un JWT `Authorization: Bearer ...` (+ headers `Version`, `Channel`, `Source`).
- El listado es `GET .../workflow/{locationId}/list?limit=...&offset=...`.
- `src/inject.js` (en el mundo de la página del iframe) observa esas peticiones para
  capturar token/headers/sessionId y luego las **re-ejecuta** desde el mismo origen, así
  que CORS y autenticación quedan resueltos igual que en el app.
- `src/content.js` hace de puente hacia la extensión, `src/background.js` enruta los
  mensajes, y `src/popup.js` arma la UI y el ZIP (con `lib/jszip.min.js`, incluido local).

## Estructura

```
extractor_wf_ghl/
├── manifest.json
├── src/
│   ├── inject.js      # captura token + replay (list / read) en el iframe
│   ├── content.js     # puente page <-> extensión
│   ├── background.js  # service worker: enruta mensajes
│   ├── popup.html
│   └── popup.js       # UI: lista, selección, progreso, ZIP
├── lib/
│   └── jszip.min.js   # generación de ZIP (local, sin CDN)
├── icons/
└── README.md
```

## Solución de problemas

- **"No se detecto la sesion todavia"**: abre o recarga un workflow una vez y reintenta.
- **Errores HTTP 401 al descargar**: el token expiró; recarga un workflow y vuelve a
  intentar (se recaptura automáticamente).
- **Otra instancia de GHL** (no `app.gohighlevel.com`): añade su dominio a `matches` y
  `host_permissions` en `manifest.json`.

## Nota

Herramienta de uso personal sobre tus propios datos y tu propia sesión autenticada.
