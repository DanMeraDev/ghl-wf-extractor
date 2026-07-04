(function () {
  "use strict";
  if (window.__ghlWfExtInjected) return;
  window.__ghlWfExtInjected = true;

  var TAG = "ghl-wf-ext";

  var WF_RE = /:\/\/([a-z0-9-]+\.)?backend\.leadconnectorhq\.com\/workflow\//i;

  var creds = {
    base: null,
    locationId: null,
    sessionId: null,
    headers: null,
  };

  function ready() {
    return !!(creds.base && creds.locationId && creds.headers && creds.headers.authorization);
  }

  function announce() {
    try {
      window.postMessage(
        {
          source: TAG,
          dir: "from-page",
          type: "creds",
          ready: ready(),
          meta: { locationId: creds.locationId, base: creds.base },
        },
        "*"
      );
    } catch (e) {}
  }

  function lc(obj) {

    var out = {};
    if (!obj) return out;
    Object.keys(obj).forEach(function (k) {
      out[k.toLowerCase()] = obj[k];
    });
    return out;
  }

  function captureFrom(url, headers) {
    try {
      var mBase = url.match(/^(https?:\/\/[^/]+\/workflow)\//i);
      var mLoc = url.match(/\/workflow\/([^/?]+)/i);
      if (mBase) creds.base = mBase[1];
      if (mLoc) creds.locationId = decodeURIComponent(mLoc[1]);

      var sid = url.match(/[?&]sessionId=([^&]+)/i);
      if (sid) creds.sessionId = decodeURIComponent(sid[1]);

      var h = lc(headers);
      if (h.authorization) {

        var keep = {};
        ["authorization", "version", "channel", "source", "token-id", "accept"].forEach(function (k) {
          if (h[k] != null) keep[k] = h[k];
        });
        if (!keep.accept) keep.accept = "application/json";
        creds.headers = keep;
      }
      announce();
    } catch (e) {}
  }

  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input, init) {
      try {
        var url = typeof input === "string" ? input : input && input.url;
        if (url && WF_RE.test(url)) {
          var headers = {};
          if (typeof Request !== "undefined" && input instanceof Request) {
            input.headers.forEach(function (v, k) {
              headers[k] = v;
            });
          }
          if (init && init.headers) {
            var hh = init.headers;
            if (typeof Headers !== "undefined" && hh instanceof Headers) {
              hh.forEach(function (v, k) {
                headers[k] = v;
              });
            } else if (Array.isArray(hh)) {
              hh.forEach(function (pair) {
                headers[pair[0]] = pair[1];
              });
            } else {
              Object.keys(hh).forEach(function (k) {
                headers[k] = hh[k];
              });
            }
          }
          captureFrom(url, headers);
        }
      } catch (e) {}
      return origFetch.apply(this, arguments);
    };
  }

  var XO = XMLHttpRequest.prototype.open;
  var XS = XMLHttpRequest.prototype.setRequestHeader;
  var XSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__wfUrl = url;
    this.__wfHeaders = {};
    return XO.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    try {
      if (this.__wfHeaders) this.__wfHeaders[k] = v;
    } catch (e) {}
    return XS.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    try {
      if (this.__wfUrl && WF_RE.test(this.__wfUrl)) captureFrom(this.__wfUrl, this.__wfHeaders || {});
    } catch (e) {}
    return XSend.apply(this, arguments);
  };

  function apiFetch(url) {

    return origFetch.call(window, url, {
      method: "GET",
      headers: creds.headers || {},
    }).then(function (r) {
      if (!r.ok) {
        var err = new Error("HTTP " + r.status);
        err.status = r.status;
        throw err;
      }
      return r.json();
    });
  }

  function idOf(o) {
    return o && (o.id != null ? o.id : o._id != null ? o._id : o.workflowId != null ? o.workflowId : o.uuid);
  }
  function nameOf(o) {
    return o && (o.name || o.title || o.workflowName || o.label);
  }
  function looksWorkflow(o) {
    return o && typeof o === "object" && idOf(o) != null && nameOf(o) != null;
  }

  function deepFindArrays(obj, acc, depth) {
    if (!obj || typeof obj !== "object" || depth > 6) return;
    if (Array.isArray(obj)) {
      acc.push(obj);
      return;
    }
    Object.keys(obj).forEach(function (k) {
      deepFindArrays(obj[k], acc, depth + 1);
    });
  }

  function extractItems(j) {
    if (Array.isArray(j) && j.length && looksWorkflow(j[0])) return j;
    var acc = [];
    deepFindArrays(j, acc, 0);
    var best = null,
      bestScore = -1;
    acc.forEach(function (arr) {
      if (!arr.length || typeof arr[0] !== "object") return;
      var wf = arr.filter(looksWorkflow).length;

      var score = wf > 0 ? wf * 100000 + arr.length : idOf(arr[0]) != null ? arr.length : 0;
      if (score > bestScore) {
        bestScore = score;
        best = arr;
      }
    });
    return best && bestScore > 0 ? best : [];
  }

  function normItem(w) {
    var id = idOf(w);
    return {
      id: String(id),
      name: String(nameOf(w) || id || "item"),
      type: w.type === "directory" || isFolder(w) ? "directory" : "workflow",
      parentId: w.parentId != null ? String(w.parentId) : null,
      status: w.status || w.state || "",
    };
  }

  function debugShape(v, d) {
    if (v === null) return null;
    if (Array.isArray(v)) return "array(" + v.length + ")" + (v.length ? " of " + debugShape(v[0], d - 1) : "");
    if (typeof v === "object") {
      if (d <= 0) return "object";
      var o = {};
      Object.keys(v).slice(0, 25).forEach(function (k) {
        o[k] = debugShape(v[k], d - 1);
      });
      return o;
    }
    return typeof v;
  }

  function isFolder(o) {
    var t = String(o.type || o.kind || o.entityType || o.nodeType || "").toLowerCase();
    if (t === "folder" || t === "directory" || t === "group") return true;
    if (o.isFolder === true || o.isDirectory === true || o.folder === true) return true;
    return false;
  }

  function listLevel(parentId) {
    var out = [];
    var limit = 100;
    var firstJson = null;
    function page(offset) {
      var url =
        creds.base +
        "/" +
        encodeURIComponent(creds.locationId) +
        "/list?limit=" +
        limit +
        "&offset=" +
        offset +
        (parentId ? "&parentId=" + encodeURIComponent(parentId) : "");
      return apiFetch(url).then(function (j) {
        if (firstJson === null) firstJson = j;
        var raw = extractItems(j);
        out = out.concat(raw.map(normItem));
        if (raw.length >= limit && offset + limit <= 10000) {
          return page(offset + limit);
        }
        return { items: out, firstJson: firstJson };
      });
    }
    return page(0);
  }

  function loadAll() {
    return listLevel(null).then(function (root) {
      var rootItems = root.items;
      var alreadyFlat = rootItems.some(function (it) {
        return it.parentId;
      });
      if (alreadyFlat) {
        return { items: dedup(rootItems), debug: rootItems.length ? null : debugShape(root.firstJson, 4) };
      }
      var all = rootItems.slice();
      var dirs = rootItems
        .filter(function (it) {
          return it.type === "directory";
        })
        .map(function (d) {
          return d.id;
        });
      var seen = {};
      function next() {
        if (!dirs.length) return { items: dedup(all), debug: all.length ? null : debugShape(root.firstJson, 4) };
        var pid = dirs.shift();
        if (seen[pid]) return next();
        seen[pid] = 1;
        return listLevel(pid).then(function (lvl) {
          lvl.items.forEach(function (k) {
            all.push(k);
            if (k.type === "directory") dirs.push(k.id);
          });
          return next();
        });
      }
      return next();
    });
  }

  function dedup(arr) {
    var seen = {};
    return arr.filter(function (it) {
      if (!it.id || it.id === "undefined" || seen[it.id]) return false;
      seen[it.id] = 1;
      return true;
    });
  }

  function readOne(id) {
    var url =
      creds.base +
      "/" +
      encodeURIComponent(creds.locationId) +
      "/" +
      encodeURIComponent(id) +
      "?includeScheduledPauseInfo=true" +
      (creds.sessionId ? "&sessionId=" + encodeURIComponent(creds.sessionId) : "");
    return apiFetch(url);
  }

  function fetchSelected(ids, reqId) {
    var results = [];
    var total = ids.length;
    var done = 0;
    var idx = 0;
    var CONCURRENCY = 5;

    function reportProgress() {
      window.postMessage({ source: TAG, dir: "from-page", type: "fetch-progress", reqId: reqId, done: done, total: total }, "*");
    }

    function worker() {
      if (idx >= ids.length) return Promise.resolve();
      var myIdx = idx++;
      var id = ids[myIdx];
      return readOne(id)
        .then(function (json) {
          results[myIdx] = { id: id, ok: true, json: json };
        })
        .catch(function (e) {
          results[myIdx] = { id: id, ok: false, error: (e && e.message) || String(e), status: e && e.status };
        })
        .then(function () {
          done++;
          reportProgress();
          return worker();
        });
    }

    reportProgress();
    var pool = [];
    for (var w = 0; w < Math.min(CONCURRENCY, ids.length); w++) pool.push(worker());
    return Promise.all(pool).then(function () {
      return results;
    });
  }

  window.addEventListener("message", function (ev) {
    var d = ev.data;
    if (!d || d.source !== TAG || d.dir !== "to-page") return;
    var reqId = d.reqId;

    if (d.action === "status") {
      window.postMessage(
        { source: TAG, dir: "from-page", type: "status-result", reqId: reqId, ready: ready(), meta: { locationId: creds.locationId, base: creds.base } },
        "*"
      );
      return;
    }

    if (!ready()) {
      window.postMessage({ source: TAG, dir: "from-page", type: d.action + "-result", reqId: reqId, ok: false, error: "no-creds" }, "*");
      return;
    }

    if (d.action === "list") {
      loadAll()
        .then(function (r) {
          window.postMessage({ source: TAG, dir: "from-page", type: "list-result", reqId: reqId, ok: true, data: r.items, debug: r.debug }, "*");
        })
        .catch(function (e) {
          window.postMessage({ source: TAG, dir: "from-page", type: "list-result", reqId: reqId, ok: false, error: (e && e.message) || String(e) }, "*");
        });
      return;
    }

    if (d.action === "fetch") {
      fetchSelected(d.ids || [], reqId)
        .then(function (results) {
          window.postMessage({ source: TAG, dir: "from-page", type: "fetch-result", reqId: reqId, ok: true, data: results }, "*");
        })
        .catch(function (e) {
          window.postMessage({ source: TAG, dir: "from-page", type: "fetch-result", reqId: reqId, ok: false, error: (e && e.message) || String(e) }, "*");
        });
      return;
    }
  });

  announce();
})();
