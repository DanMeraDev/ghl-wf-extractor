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
  openOpts: document.getElementById("openOpts"),
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
  if (m.kind === "status-result" || m.kind === "creds") {
    if (m.meta) {
      if (m.meta.locationId) meta.locationId = m.meta.locationId;
      if (m.meta.base) meta.base = m.meta.base;
    }
    if (m.ready) {
      showLoc();
      requestSedeName();
      if (allItems.length === 0) requestList();
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
      setMsg("Download error: " + m.error, "err");
      els.download.disabled = false;
    }
    return;
  }
}

function showLoc() {
  if (meta && meta.locName) els.locLabel.textContent = "Location: " + meta.locName;
  else if (meta && meta.locationId) els.locLabel.textContent = "Location ID: " + meta.locationId;
}
function showNoCreds(err) {
  els.toolbar.style.display = "none";
  els.crumb.style.display = "none";
  els.list.innerHTML = "";
  els.empty.style.display = "block";
  if (err && err !== "no-creds") {
    els.empty.textContent = "Could not list: " + err;
  } else {
    els.empty.innerHTML =
      "Session not detected yet.<br><br>Open or <b>reload a workflow</b> in this tab once, then reopen this window.";
  }
  els.download.disabled = true;
}
function requestList() {
  els.empty.style.display = "block";
  els.empty.textContent = "Loading workflows...";
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
        "The list wasn't recognized. Share this structure so it can be adjusted:" +
        '<pre style="text-align:left;white-space:pre-wrap;background:var(--hover);padding:8px;border-radius:6px;margin-top:8px;user-select:all;font-size:11px;">' +
        escapeHtml(JSON.stringify(lastDebug, null, 2)) +
        "</pre>";
    } else {
      els.empty.textContent = "No workflows found in this location.";
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
  els.crumb.appendChild(mk("Home", 0, pathStack.length === 0));
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
  cb.title = "Select the whole folder";
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
    none.textContent = "No matches.";
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
  els.download.textContent = "Download selected (" + n + ")";
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
  setMsg("Downloading " + done + " / " + total + "...");
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
    setMsg("Couldn't fetch any JSON. " + (failed.length ? "Failures: " + failed.join(", ") : ""), "err");
    return;
  }

  var sede = sedeName();

  if (ok.length === 1) {
    var r0 = ok[0];
    var w0 = byId[r0.id] || { id: r0.id, name: r0.id };
    var fn = (sede ? sede + " - " : "") + sanitize(w0.name) + ".json";
    var blob = new Blob([JSON.stringify(r0.json, null, 2)], { type: "application/json" });
    triggerDownload(blob, fn);
    setMsg("Done: " + fn + " downloaded." + (failed.length ? " " + failed.length + " failed." : ""), failed.length ? "err" : "ok");
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

  setMsg("Generating ZIP...");
  zip.generateAsync({ type: "blob", compression: "DEFLATE" }).then(function (blob) {
    var date = new Date().toISOString().slice(0, 10);
    var zipName = (sede || "workflows-" + ((meta && meta.locationId) || "ghl")) + " - " + date + ".zip";
    triggerDownload(blob, zipName);
    var txt = "Done: " + ok.length + " workflow(s) in the ZIP.";
    if (failed.length) txt += " " + failed.length + " failed.";
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

// Reads the location/sub-account name from the active tab's localStorage
// (activeTab permission, granted when the popup opens). Best effort; if not found,
// the locationId is used.
function requestSedeName() {
  if (!tabId || !meta.locationId || meta.locName) return;
  if (!chrome.scripting || !chrome.scripting.executeScript) return;
  try {
    chrome.scripting.executeScript(
      {
        target: { tabId: tabId },
        args: [meta.locationId],
        func: function (target) {
          function search(obj, t, d) {
            if (!obj || typeof obj !== "object" || d > 6) return null;
            if (Array.isArray(obj)) {
              for (var i = 0; i < obj.length; i++) {
                var r = search(obj[i], t, d + 1);
                if (r) return r;
              }
              return null;
            }
            var idv = obj.id || obj._id || obj.locationId;
            if (idv === t && typeof obj.name === "string" && obj.name.trim()) return obj.name.trim();
            for (var k in obj) {
              if (Object.prototype.hasOwnProperty.call(obj, k)) {
                var r2 = search(obj[k], t, d + 1);
                if (r2) return r2;
              }
            }
            return null;
          }
          function tp(v) {
            try {
              return JSON.parse(v);
            } catch (e) {}
            try {
              return JSON.parse(atob(v));
            } catch (e) {}
            return null;
          }
          try {
            for (var i = 0; i < localStorage.length; i++) {
              var key = localStorage.key(i);
              var val = localStorage.getItem(key);
              if (!val || val.length > 200000) continue;
              var p = tp(val);
              if (p) {
                var r = search(p, target, 0);
                if (r) return r;
              }
            }
          } catch (e) {}
          return null;
        },
      },
      function (res) {
        if (chrome.runtime.lastError) return;
        var name = res && res[0] && res[0].result;
        if (name) {
          meta.locName = name;
          showLoc();
        }
      }
    );
  } catch (e) {}
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return "";
  }
}

function isGhlHost(host, domains) {
  if (!host) return false;
  if (/(^|\.)leadconnectorhq\.com$/.test(host)) return true;
  return domains.some(function (d) {
    return host === d || host.indexOf("." + d) === host.length - d.length - 1;
  });
}

function init() {
  chrome.storage.sync.get({ ghlDomains: ["app.gohighlevel.com"] }, function (cfg) {
    var domains = (cfg && cfg.ghlDomains) || [];
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs || !tabs.length) {
        showNoCreds("no-tab");
        return;
      }
      tabId = tabs[0].id;
      var known = isGhlHost(hostOf(tabs[0].url || ""), domains);
      connect();
      send("status");
      setTimeout(function () {
        if (allItems.length === 0 && (!meta || !meta.locationId)) {
          els.toolbar.style.display = "none";
          els.crumb.style.display = "none";
          els.list.innerHTML = "";
          els.empty.style.display = "block";
          els.download.disabled = true;
          if (known) {
            els.empty.innerHTML =
              "Session not detected yet.<br><br>Open or <b>reload a workflow</b> in this tab once, then reopen this window.";
          } else {
            els.empty.innerHTML =
              "This tab doesn't look like a configured GHL domain.<br><br>Open your GHL account on a <b>workflow</b>, or add your domain in " +
              '<a href="#" id="openOpts2">Options</a>.';
            var o2 = document.getElementById("openOpts2");
            if (o2) o2.addEventListener("click", openOptions);
          }
        }
      }, 1600);
    });
  });
}

function openOptions(e) {
  if (e) e.preventDefault();
  if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
}
if (els.openOpts) els.openOpts.addEventListener("click", openOptions);

init();
