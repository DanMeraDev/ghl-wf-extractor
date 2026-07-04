"use strict";

var els = {
  locLabel: document.getElementById("locLabel"),
  toolbar: document.getElementById("toolbar"),
  search: document.getElementById("search"),
  selAll: document.getElementById("selAll"),
  selNone: document.getElementById("selNone"),
  crumb: document.getElementById("crumb"),
  list: document.getElementById("list"),
  empty: document.getElementById("empty"),
  progress: document.getElementById("progress"),
  progressBar: document.getElementById("progressBar"),
  msg: document.getElementById("msg"),
  download: document.getElementById("download"),
};

var tabId = null;
var port = null;
var allItems = [];
var byId = {};
var childrenOf = {};
var pathStack = [];
var selected = {};
var meta = {};
var lastDebug = null;
var reqSeq = 1;

function nextReq() {
  return "r" + reqSeq++;
}
function setMsg(text, cls) {
  els.msg.textContent = text || "";
  els.msg.className = "msg" + (cls ? " " + cls : "");
}
function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, function (c) {
    return c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;";
  });
}

function connect() {
  port = chrome.runtime.connect({ name: "popup" });
  port.onMessage.addListener(onPortMessage);
  port.onDisconnect.addListener(function () {
    port = null;
  });
}
function send(cmd, extra) {
  var reqId = nextReq();
  port.postMessage(Object.assign({ cmd: cmd, tabId: tabId, reqId: reqId }, extra || {}));
  return reqId;
}
function onPortMessage(m) {
  if (!m) return;
  if (m.kind === "loc-name") {
    if (m.name) meta.locName = m.name;
    showLoc();
    return;
  }
  if (m.kind === "status-result" || m.kind === "creds") {
    if (m.meta) {
      if (m.meta.locationId) meta.locationId = m.meta.locationId;
      if (m.meta.base) meta.base = m.meta.base;
      if (m.meta.locName) meta.locName = m.meta.locName;
    }
    if (m.ready && allItems.length === 0) {
      showLoc();
      requestList();
    }
    return;
  }
  if (m.kind === "list-result") {
    if (m.ok) {
      allItems = m.data || [];
      lastDebug = m.debug || null;
      indexItems();
      renderTree();
    } else {
      showNoCreds(m.error);
    }
    return;
  }
  if (m.kind === "fetch-progress") {
    updateProgress(m.done, m.total);
    return;
  }
  if (m.kind === "fetch-result") {
    if (m.ok) buildZip(m.data || []);
    else {
      setMsg("Error al descargar: " + m.error, "err");
      els.download.disabled = false;
    }
    return;
  }
}

function showLoc() {
  if (meta && meta.locName) els.locLabel.textContent = "Sede: " + meta.locName;
  else if (meta && meta.locationId) els.locLabel.textContent = "Ubicacion: " + meta.locationId;
}
function showNoCreds(err) {
  els.toolbar.style.display = "none";
  els.crumb.style.display = "none";
  els.list.innerHTML = "";
  els.empty.style.display = "block";
  if (err && err !== "no-creds") {
    els.empty.textContent = "No se pudo listar: " + err;
  } else {
    els.empty.innerHTML =
      "No se detecto la sesion todavia.<br><br>Abre o <b>recarga un workflow</b> en esta pestaña una vez y vuelve a abrir esta ventana.";
  }
  els.download.disabled = true;
}
function requestList() {
  els.empty.style.display = "block";
  els.empty.textContent = "Cargando workflows...";
  send("list");
}

function indexItems() {
  byId = {};
  childrenOf = {};
  allItems.forEach(function (it) {
    byId[it.id] = it;
  });
  allItems.forEach(function (it) {
    var key = it.parentId && byId[it.parentId] ? it.parentId : "ROOT";
    (childrenOf[key] = childrenOf[key] || []).push(it);
  });
  Object.keys(childrenOf).forEach(function (k) {
    childrenOf[k].sort(function (a, b) {
      var af = a.type === "directory",
        bf = b.type === "directory";
      if (af !== bf) return af ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  });
}

function currentKey() {
  return pathStack.length ? pathStack[pathStack.length - 1].id : "ROOT";
}

function descendantWorkflows(folderId) {
  var out = [];
  var stack = [folderId];
  while (stack.length) {
    var p = stack.pop();
    (childrenOf[p] || []).forEach(function (it) {
      if (it.type === "directory") stack.push(it.id);
      else out.push(it);
    });
  }
  return out;
}

function folderPathNames(id) {
  var parts = [];
  var cur = byId[id];
  while (cur && cur.parentId && byId[cur.parentId]) {
    var par = byId[cur.parentId];
    parts.unshift(par.name);
    cur = par;
  }
  return parts;
}

function renderTree() {
  var totalWf = allItems.filter(function (i) {
    return i.type === "workflow";
  }).length;
  if (!allItems.length || totalWf === 0) {
    els.toolbar.style.display = "none";
    els.crumb.style.display = "none";
    els.empty.style.display = "block";
    if (lastDebug) {
      els.empty.innerHTML =
        "No se reconocio la lista. Comparte esta estructura para ajustar:" +
        '<pre style="text-align:left;white-space:pre-wrap;background:var(--hover);padding:8px;border-radius:6px;margin-top:8px;user-select:all;font-size:11px;">' +
        escapeHtml(JSON.stringify(lastDebug, null, 2)) +
        "</pre>";
    } else {
      els.empty.textContent = "No se encontraron workflows en esta ubicacion.";
    }
    return;
  }
  els.empty.style.display = "none";
  els.toolbar.style.display = "flex";
  var q = (els.search.value || "").trim().toLowerCase();
  if (q) renderSearch(q);
  else renderLevel();
  updateDownloadBtn();
}

function renderCrumb() {
  if ((els.search.value || "").trim()) {
    els.crumb.style.display = "none";
    return;
  }
  els.crumb.style.display = "flex";
  els.crumb.innerHTML = "";
  var mk = function (label, idx, isCur) {
    var s = document.createElement("span");
    s.textContent = label;
    s.className = isCur ? "cur" : "seg";
    if (!isCur)
      s.addEventListener("click", function () {
        pathStack = pathStack.slice(0, idx);
        renderTree();
      });
    return s;
  };
  els.crumb.appendChild(mk("Inicio", 0, pathStack.length === 0));
  pathStack.forEach(function (p, i) {
    var sep = document.createElement("span");
    sep.className = "sep";
    sep.textContent = "›";
    els.crumb.appendChild(sep);
    els.crumb.appendChild(mk(p.name, i + 1, i === pathStack.length - 1));
  });
}

function makeCheckbox(checked, indeterminate) {
  var cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = !!checked;
  if (indeterminate) cb.indeterminate = true;
  return cb;
}

function renderLevel() {
  renderCrumb();
  els.list.innerHTML = "";
  var frag = document.createDocumentFragment();
  var kids = childrenOf[currentKey()] || [];
  kids.forEach(function (it) {
    if (it.type === "directory") frag.appendChild(folderRow(it));
    else frag.appendChild(workflowRow(it, false));
  });
  els.list.appendChild(frag);
}

function folderRow(dir) {
  var row = document.createElement("div");
  row.className = "row";
  var desc = descendantWorkflows(dir.id);
  var selCount = desc.filter(function (w) {
    return selected[w.id];
  }).length;

  var cb = makeCheckbox(desc.length > 0 && selCount === desc.length, selCount > 0 && selCount < desc.length);
  cb.title = "Seleccionar toda la carpeta";
  cb.addEventListener("click", function (e) {
    e.stopPropagation();
    var sel = cb.checked;
    desc.forEach(function (w) {
      if (sel) selected[w.id] = true;
      else delete selected[w.id];
    });
    renderTree();
  });

  var enter = document.createElement("div");
  enter.className = "enter";
  enter.innerHTML =
    '<span class="ficon">📁</span><span class="name"></span><span class="count">(' +
    desc.length +
    ')</span><span class="chev">›</span>';
  enter.querySelector(".name").textContent = dir.name;
  enter.style.cursor = "pointer";
  enter.addEventListener("click", function () {
    pathStack.push({ id: dir.id, name: dir.name });
    renderTree();
  });

  row.appendChild(cb);
  row.appendChild(enter);
  return row;
}

function workflowRow(w, showPath) {
  var row = document.createElement("label");
  row.className = "row";
  var cb = makeCheckbox(!!selected[w.id], false);
  cb.addEventListener("change", function () {
    if (cb.checked) selected[w.id] = true;
    else delete selected[w.id];
    updateDownloadBtn();

    if (!(els.search.value || "").trim()) refreshFolderChecks();
  });
  var name = document.createElement("span");
  name.className = "name";
  name.textContent = w.name;
  name.title = w.name;
  row.appendChild(cb);
  row.appendChild(name);
  if (showPath) {
    var path = folderPathNames(w.id).join(" / ");
    if (path) {
      var p = document.createElement("span");
      p.className = "path";
      p.textContent = path;
      row.appendChild(p);
    }
  }
  return row;
}

function refreshFolderChecks() {

  renderLevel();
}

function renderSearch(q) {
  renderCrumb();
  els.list.innerHTML = "";
  var frag = document.createDocumentFragment();
  var matches = allItems.filter(function (it) {
    return it.type === "workflow" && it.name.toLowerCase().indexOf(q) !== -1;
  });
  if (!matches.length) {
    var none = document.createElement("div");
    none.className = "empty";
    none.style.display = "block";
    none.textContent = "Sin coincidencias.";
    els.list.appendChild(none);
    return;
  }
  matches.sort(function (a, b) {
    return a.name.localeCompare(b.name);
  });
  matches.forEach(function (w) {
    frag.appendChild(workflowRow(w, true));
  });
  els.list.appendChild(frag);
}

function updateDownloadBtn() {
  var n = Object.keys(selected).length;
  els.download.textContent = "Descargar seleccionados (" + n + ")";
  els.download.disabled = n === 0;
}

function selectCurrent(val) {
  var targets;
  var q = (els.search.value || "").trim().toLowerCase();
  if (q) {
    targets = allItems.filter(function (it) {
      return it.type === "workflow" && it.name.toLowerCase().indexOf(q) !== -1;
    });
  } else {

    targets = currentKey() === "ROOT" ? descendantWorkflows("ROOT") : descendantWorkflows(currentKey());
  }
  targets.forEach(function (w) {
    if (val) selected[w.id] = true;
    else delete selected[w.id];
  });
  renderTree();
}

function updateProgress(done, total) {
  els.progress.style.display = "block";
  var pct = total ? Math.round((done / total) * 100) : 0;
  els.progressBar.style.width = pct + "%";
  setMsg("Descargando " + done + " / " + total + "...");
}

function sanitize(name) {
  return String(name == null ? "item" : name)
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "item";
}

function sedeName() {
  return (meta && meta.locName) ? sanitize(meta.locName) : null;
}

function triggerDownload(blob, filename) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 4000);
}

function buildZip(results) {
  var ok = results.filter(function (r) {
    return r.ok;
  });
  var failed = results
    .filter(function (r) {
      return !r.ok;
    })
    .map(function (r) {
      var w = byId[r.id] || { id: r.id, name: r.id };
      return w.name + (r.status ? " (HTTP " + r.status + ")" : "");
    });

  els.progress.style.display = "none";
  els.download.disabled = false;

  if (ok.length === 0) {
    setMsg("No se pudo obtener ningun JSON. " + (failed.length ? "Fallos: " + failed.join(", ") : ""), "err");
    return;
  }

  var sede = sedeName();

  if (ok.length === 1) {
    var r0 = ok[0];
    var w0 = byId[r0.id] || { id: r0.id, name: r0.id };
    var fn = (sede ? sede + " - " : "") + sanitize(w0.name) + ".json";
    var blob = new Blob([JSON.stringify(r0.json, null, 2)], { type: "application/json" });
    triggerDownload(blob, fn);
    setMsg("Listo: " + fn + " descargado." + (failed.length ? " " + failed.length + " fallaron." : ""), failed.length ? "err" : "ok");
    return;
  }

  var zip = new JSZip();
  var used = {};
  ok.forEach(function (r) {
    var w = byId[r.id] || { id: r.id, name: r.id };
    var pathParts = folderPathNames(r.id).map(sanitize);
    var dir = pathParts.join("/");
    var nm = sanitize(w.name);
    var key = dir + "/" + nm;
    var fname;
    if (used[key]) fname = nm + " (" + ++used[key] + ").json";
    else {
      used[key] = 1;
      fname = nm + ".json";
    }
    var full = dir ? dir + "/" + fname : fname;
    zip.file(full, JSON.stringify(r.json, null, 2));
  });

  setMsg("Generando ZIP...");
  zip.generateAsync({ type: "blob", compression: "DEFLATE" }).then(function (blob) {
    var date = new Date().toISOString().slice(0, 10);
    var zipName = (sede || "workflows-" + ((meta && meta.locationId) || "ghl")) + " - " + date + ".zip";
    triggerDownload(blob, zipName);
    var txt = "Listo: " + ok.length + " workflow(s) en el ZIP.";
    if (failed.length) txt += " " + failed.length + " fallaron.";
    setMsg(txt, failed.length ? "err" : "ok");
  });
}

els.search.addEventListener("input", renderTree);
els.selAll.addEventListener("click", function () {
  selectCurrent(true);
});
els.selNone.addEventListener("click", function () {
  selectCurrent(false);
});
els.download.addEventListener("click", function () {
  var ids = Object.keys(selected);
  if (!ids.length) return;
  els.download.disabled = true;
  setMsg("");
  updateProgress(0, ids.length);
  send("fetch", { ids: ids });
});

function init() {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (!tabs || !tabs.length) {
      showNoCreds("no-tab");
      return;
    }
    tabId = tabs[0].id;
    var url = tabs[0].url || "";
    if (url.indexOf("app.gohighlevel.com") === -1 && url.indexOf("leadconnectorhq.com") === -1) {
      els.empty.style.display = "block";
      els.empty.innerHTML = "Abre esta ventana estando en <code>app.gohighlevel.com</code>, dentro de un workflow.";
      return;
    }
    connect();
    send("status");
    setTimeout(function () {
      if (allItems.length === 0 && (!meta || !meta.locationId)) showNoCreds("no-creds");
    }, 1600);
  });
}

init();
