# GHL Workflow Extractor

> 🇪🇸 Versión en español: [README.es.md](README.es.md)

A Chrome extension (Manifest V3) that exports your GoHighLevel workflow JSONs without having
to open DevTools and copy responses one by one.

It works on **any GHL instance** (GoHighLevel or any white-label), because the workflow
editor always runs inside an iframe of `*.leadconnectorhq.com`.

Instead of the manual process (DevTools → Network → filter Fetch/XHR → reload → find the
endpoint with the workflow ID → copy the `response`), the extension:

1. Captures the token from your active session (from a request GHL itself already makes).
2. Shows your workflows in a **folder browser**, just like the GHL page.
3. You check the ones you want (per workflow or whole folders), with a search box.
4. Downloads them: **1 workflow → a single `.json`**; **several → a ZIP** with nested
   subfolders that mirror your GHL folders.

Everything happens locally in your browser, with your own session. Nothing is sent to third
parties and no external CDNs are used.

## Installation (developer mode)

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.
4. (Optional) Open the extension's **Options** and add your GHL domain if it isn't
   `app.gohighlevel.com` (e.g. your white-label). This only improves tab recognition and the
   location name; extraction works the same without configuring it.

## Usage

1. Log in to your GHL account.
2. Open **any workflow** once, or **reload** the page of a workflow that's already open.
   This makes the extension capture your session token.
   > If you just installed the extension, reload the workflow tab: extensions are not
   > injected into tabs that were already open before they were installed.
3. Click the extension icon. You'll see your folders and workflows.
4. Enter folders, check what you want (or entire folders), and use the search box.
5. Click **Download selected (N)**:
   - 1 workflow → `Location - Name.json` (or `Name.json` if the location isn't detected).
   - Several → `Location - date.zip` with one `.json` per workflow, in subfolders matching
     your GHL folders.

## Configuration

In **Options** you can define the GHL domains (one per line) you use to log in to your
account. Default: `app.gohighlevel.com`. It's optional: it's used to recognize the tab and to
read the location/sub-account name from the app itself.

## How it works (technical)

- The workflow editor/list runs in an **iframe** of
  `client-app-automation-workflows.leadconnectorhq.com` (constant across every GHL instance).
- A workflow's JSON:
  `GET https://backend.leadconnectorhq.com/workflow/{locationId}/{workflowId}?includeScheduledPauseInfo=true&sessionId=...`
  with `Authorization: Bearer ...` (+ `Version`, `Channel`, `Source` headers).
- The listing (with folder hierarchy):
  `GET .../workflow/{locationId}/list?limit=&offset=&parentId=`. Items carry a
  `type` (`directory`/`workflow`) and a `parentId`.
- `src/inject.js` (the iframe's page world) observes those requests to capture
  token/headers/sessionId and then **replays** them from the same origin (CORS and auth
  already resolved). `src/content.js` acts as a bridge, `src/background.js` routes messages,
  and `src/popup.js` builds the folder tree and the ZIP (using `lib/jszip.min.js`, local).
- The location name is read from the active tab via `chrome.scripting` (the `activeTab`
  permission), on a best-effort basis.

## Structure

```
.
├── manifest.json
├── src/
│   ├── inject.js      # token capture + replay (list / read) in the iframe
│   ├── content.js     # page <-> extension bridge
│   ├── background.js  # service worker: routes messages
│   ├── popup.html / popup.js   # folder browser, selection, ZIP
│   └── options.html / options.js  # domain configuration
├── lib/jszip.min.js   # ZIP generation (local, no CDN)
├── icons/
└── README.md
```

## Troubleshooting

- **"Session not detected yet"**: open or reload a workflow once and retry.
- **HTTP 401 on download**: the token expired; reload a workflow and retry.
- **The tab isn't recognized**: add your GHL domain in Options.

## Note

A tool for personal use on your own data and your own authenticated session.
