// content.js — content script (world ISOLATED) en TODOS los frames.
// Hace de puente: page/inject.js (window.postMessage) <-> extension (chrome.runtime).
// inject.js se carga como content script en el mundo MAIN (ver manifest.json).
(function () {
  "use strict";
  var TAG = "ghl-wf-ext";

  // page -> extension
  window.addEventListener("message", function (ev) {
    if (ev.source !== window) return;
    var d = ev.data;
    if (!d || d.source !== TAG || d.dir !== "from-page") return;
    try {
      chrome.runtime.sendMessage({ __ghlwf: true, from: "page", payload: d });
    } catch (e) {
      // el contexto de la extension puede haberse invalidado tras recargar; se ignora.
    }
  });

  // extension -> page
  chrome.runtime.onMessage.addListener(function (msg) {
    if (!msg || !msg.__ghlwf || msg.to !== "page") return;
    try {
      window.postMessage(Object.assign({ source: TAG, dir: "to-page" }, msg.payload), "*");
    } catch (e) {}
  });

  // ---- Detecta el nombre de la sede/subcuenta desde el almacenamiento de la app ----
  function locId() {
    var m = location.href.match(/\/location\/([^/?#]+)/);
    return m ? m[1] : null;
  }

  function searchName(obj, target, depth) {
    if (!obj || typeof obj !== "object" || depth > 6) return null;
    if (Array.isArray(obj)) {
      for (var i = 0; i < obj.length; i++) {
        var r = searchName(obj[i], target, depth + 1);
        if (r) return r;
      }
      return null;
    }
    var idv = obj.id || obj._id || obj.locationId;
    if (idv === target && typeof obj.name === "string" && obj.name.trim()) return obj.name.trim();
    for (var k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) {
        var r2 = searchName(obj[k], target, depth + 1);
        if (r2) return r2;
      }
    }
    return null;
  }

  function tryParse(val) {
    try {
      return JSON.parse(val);
    } catch (e) {}
    try {
      return JSON.parse(atob(val));
    } catch (e2) {}
    return null;
  }

  function findLocName(target) {
    if (!target) return null;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        var val = localStorage.getItem(key);
        if (!val || val.length > 200000) continue;
        var parsed = tryParse(val);
        if (parsed) {
          var r = searchName(parsed, target, 0);
          if (r) return r;
        }
      }
    } catch (e) {}
    return null;
  }

  function reportLocName() {
    var target = locId();
    var name = findLocName(target);
    if (name) {
      try {
        chrome.runtime.sendMessage({ __ghlwf: true, from: "loc-name", locationId: target, name: name });
      } catch (e) {}
      return true;
    }
    return false;
  }

  // Intenta ya y reintenta mientras la app termina de cargar el estado.
  if (!reportLocName()) {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (reportLocName() || tries > 10) clearInterval(iv);
    }, 1000);
  }
})();
