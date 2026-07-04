"use strict";

var state = {};

var popupPort = null;

chrome.runtime.onMessage.addListener(function (msg, sender) {
  if (!msg || !msg.__ghlwf) return;
  var tabId = sender.tab && sender.tab.id;
  if (tabId == null) return;

  if (msg.from === "loc-name") {
    state[tabId] = state[tabId] || {};
    state[tabId].locName = msg.name;
    if (popupPort) {
      try {
        popupPort.postMessage({ kind: "loc-name", tabId: tabId, name: msg.name });
      } catch (e) {}
    }
    return;
  }

  if (msg.from !== "page") return;
  var d = msg.payload || {};

  if (d.type === "creds" || d.type === "status-result") {
    var prev = state[tabId] || {};
    if (d.ready) {
      state[tabId] = { frameId: sender.frameId, ready: true, meta: d.meta || {}, locName: prev.locName };
    }
    if (popupPort) {
      try {
        var meta = Object.assign({}, d.meta || {}, { locName: (state[tabId] && state[tabId].locName) || prev.locName });
        popupPort.postMessage({ kind: d.type === "creds" ? "creds" : "status-result", tabId: tabId, ready: !!d.ready, meta: meta, reqId: d.reqId });
      } catch (e) {}
    }
    return;
  }

  if (popupPort) {
    try {
      popupPort.postMessage(Object.assign({ kind: d.type, tabId: tabId }, d));
    } catch (e) {}
  }
});

function sendToPage(tabId, payload) {
  var st = state[tabId];
  var opts = st && st.frameId != null ? { frameId: st.frameId } : undefined;
  chrome.tabs.sendMessage(tabId, { __ghlwf: true, to: "page", payload: payload }, opts, function () {

    void chrome.runtime.lastError;
  });
}

chrome.runtime.onConnect.addListener(function (port) {
  if (port.name !== "popup") return;
  popupPort = port;

  port.onMessage.addListener(function (m) {
    if (!m || !m.cmd) return;
    var tabId = m.tabId;

    if (m.cmd === "status") {
      var st = state[tabId];
      var ln = st && st.locName;
      if (st && st.ready) {
        port.postMessage({ kind: "status-result", tabId: tabId, ready: true, meta: Object.assign({}, st.meta, { locName: ln }), reqId: m.reqId });
      } else {

        sendToPage(tabId, { action: "status", reqId: m.reqId });
        port.postMessage({ kind: "status-result", tabId: tabId, ready: false, meta: { locName: ln }, reqId: m.reqId });
      }
      return;
    }

    if (m.cmd === "list") {
      sendToPage(tabId, { action: "list", reqId: m.reqId });
      return;
    }

    if (m.cmd === "fetch") {
      sendToPage(tabId, { action: "fetch", ids: m.ids || [], reqId: m.reqId });
      return;
    }
  });

  port.onDisconnect.addListener(function () {
    if (popupPort === port) popupPort = null;
  });
});

chrome.tabs.onRemoved.addListener(function (tabId) {
  delete state[tabId];
});
