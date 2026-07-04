(function () {
  "use strict";
  var TAG = "ghl-wf-ext";

  window.addEventListener("message", function (ev) {
    if (ev.source !== window) return;
    var d = ev.data;
    if (!d || d.source !== TAG || d.dir !== "from-page") return;
    try {
      chrome.runtime.sendMessage({ __ghlwf: true, from: "page", payload: d });
    } catch (e) {}
  });

  chrome.runtime.onMessage.addListener(function (msg) {
    if (!msg || !msg.__ghlwf || msg.to !== "page") return;
    try {
      window.postMessage(Object.assign({ source: TAG, dir: "to-page" }, msg.payload), "*");
    } catch (e) {}
  });
})();
