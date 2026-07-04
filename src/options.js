"use strict";

var DEFAULTS = ["app.gohighlevel.com"];
var elDomains = document.getElementById("domains");
var elStatus = document.getElementById("status");

function parseDomains(text) {
  return text
    .split(/[\n,]+/)
    .map(function (s) {
      return s.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
    })
    .filter(function (s) {
      return s && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s);
    });
}

function load() {
  chrome.storage.sync.get({ ghlDomains: DEFAULTS }, function (cfg) {
    elDomains.value = (cfg.ghlDomains || []).join("\n");
  });
}

function flash(msg) {
  elStatus.textContent = msg;
  elStatus.className = "status ok";
  setTimeout(function () {
    elStatus.textContent = "";
    elStatus.className = "status";
  }, 2000);
}

document.getElementById("save").addEventListener("click", function () {
  var domains = parseDomains(elDomains.value);
  chrome.storage.sync.set({ ghlDomains: domains }, function () {
    elDomains.value = domains.join("\n");
    flash("Guardado");
  });
});

document.getElementById("reset").addEventListener("click", function () {
  chrome.storage.sync.set({ ghlDomains: DEFAULTS }, function () {
    elDomains.value = DEFAULTS.join("\n");
    flash("Restablecido");
  });
});

load();
