// /live: runs from /live/api/runs, events from the SSE feed (/live/api/stream). Every value is
// written with textContent; nothing from the feed is parsed as HTML.
(function () {
  "use strict";
  var MAX_ROWS = 300;
  var tbody = document.getElementById("events");
  var empty = document.getElementById("events-empty");
  var runsList = document.getElementById("runs-list");
  var runsEmpty = document.getElementById("runs-empty");
  var conn = document.getElementById("conn");
  var connText = document.getElementById("conn-text");
  var filterLabel = document.getElementById("filter-label");
  var countEl = document.getElementById("event-count");
  var allBtn = document.getElementById("run-all");
  var filter = null;

  var el = function (tag, text, cls) {
    var e = document.createElement(tag);
    if (text !== undefined && text !== null) e.textContent = String(text);
    if (cls) e.className = cls;
    return e;
  };
  var short = function (id) { return id && id.length > 16 ? id.slice(0, 7) + "…" + id.slice(-6) : id || ""; };
  var time = function (ts) {
    var d = new Date(ts);
    return isNaN(d) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  };
  var usd = function (v) { return typeof v === "number" ? "$" + v.toFixed(4) : ""; };
  var label = function (name) { return String(name || "").replace(/^agent_/, "").replace(/_/g, " "); };

  // Square status chips: lime ok, amber warn, red blocked.
  var TONE = { ok: "ok", pass: "ok", sent: "ok", approved: "ok", once: "ok", session: "ok", always: "ok",
    approval: "warn", proposal: "warn", warn: "warn", pending: "warn", timeout: "warn",
    block: "bad", blocked: "bad", error: "bad", failed: "bad", deny: "bad", cancelled: "bad" };
  function chip(word) {
    if (!word) return null;
    return el("span", word, "chip " + (TONE[String(word).toLowerCase()] || "tag"));
  }

  function detail(e) {
    var d = e.data || {};
    switch (e.event) {
      case "agent_tool_call": return [chip(d.status), d.tool_call && d.tool_call.function ? d.tool_call.function.name : "tool"];
      case "agent_model_call": return [null, (d.model || "") + (d.latency_ms ? " · " + Math.round(d.latency_ms) + " ms" : "")];
      case "agent_gate_decision": return [chip(d.decision), d.reason || ""];
      case "agent_approval": return [chip(d.choice || d.status), ""];
      case "agent_turn_complete": return [chip(d.status), ""];
      case "agent_outcome": return [null, d.grade !== undefined ? "grade " + d.grade : (d.status || "")];
      default: return [null, d.platform || d.status || ""];
    }
  }
  function tokens(e) {
    var u = (e.data && e.data.usage) || null;
    if (!u) return "";
    return ((u.input_tokens || 0) + (u.output_tokens || 0)).toLocaleString();
  }

  function addEvent(e) {
    var tr = el("tr");
    tr.dataset.run = e.run_id;
    var smoke = e.harness_variant && e.harness_variant.label === "smoke";
    if (smoke) tr.className = "smoke";
    tr.appendChild(el("td", time(e.ts), "mono when"));
    tr.appendChild(el("td", label(e.event), "ev-name"));
    var who = el("td", null, "mono who");
    who.appendChild(el("span", short(e.run_id)));
    if (e.turn_id) who.appendChild(el("span", " / " + short(e.turn_id), "turn"));
    tr.appendChild(who);
    var d = detail(e);
    var td = el("td", null, "detail");
    if (smoke) td.appendChild(chip("smoke"));
    if (d[0]) td.appendChild(d[0]);
    if (d[1]) td.appendChild(document.createTextNode(d[1]));
    tr.appendChild(td);
    tr.appendChild(el("td", tokens(e), "num mono tok"));
    tr.appendChild(el("td", usd(e.data && e.data.cost_usd), "num mono cost"));
    if (filter && e.run_id !== filter) tr.hidden = true;
    tbody.insertBefore(tr, tbody.firstChild);
    while (tbody.children.length > MAX_ROWS) tbody.removeChild(tbody.lastChild);
    refresh();
  }

  function refresh() {
    var visible = Array.prototype.filter.call(tbody.children, function (r) { return !r.hidden; }).length;
    empty.hidden = visible > 0;
    countEl.textContent = visible ? visible + (visible === 1 ? " event" : " events") : "";
  }

  function setFilter(runId) {
    filter = runId;
    Array.prototype.forEach.call(runsList.querySelectorAll("button"), function (b) {
      var on = (b.dataset.run || null) === runId;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    });
    Array.prototype.forEach.call(tbody.children, function (r) { r.hidden = !!runId && r.dataset.run !== runId; });
    filterLabel.textContent = runId ? "· " + short(runId) : "";
    refresh();
  }
  allBtn.addEventListener("click", function () { setFilter(null); });

  function loadRuns() {
    fetch("/live/api/runs?limit=20").then(function (r) { return r.ok ? r.json() : { runs: [] }; }).then(function (body) {
      Array.prototype.slice.call(runsList.children, 1).forEach(function (li) { li.remove(); });
      (body.runs || []).forEach(function (run) {
        var li = el("li");
        var b = el("button", null, "run" + (run.run_id === filter ? " active" : ""));
        b.type = "button";
        b.dataset.run = run.run_id;
        b.setAttribute("aria-pressed", String(run.run_id === filter));
        var top = el("span", null, "mono");
        top.appendChild(document.createTextNode(short(run.run_id) + " "));
        if (run.variant_label) top.appendChild(chip(run.variant_label));
        b.appendChild(top);
        var plural = function (n, w) { return n + " " + w + (n === 1 ? "" : "s"); };
        b.appendChild(el("small", plural(run.turn_count, "turn") + " · " + plural(run.tool_calls, "tool call") + " · " + usd(run.cost_usd)));
        b.addEventListener("click", function () { setFilter(run.run_id); });
        li.appendChild(b);
        runsList.appendChild(li);
      });
      runsEmpty.hidden = (body.runs || []).length > 0;
    }).catch(function () {});
  }

  function connect() {
    if (!window.EventSource) { connText.textContent = "Streaming unsupported"; return; }
    var es = new EventSource("/live/api/stream");
    es.addEventListener("open", function () { conn.classList.add("on"); connText.textContent = "Live"; });
    es.addEventListener("error", function () { conn.classList.remove("on"); connText.textContent = "Reconnecting"; });
    es.addEventListener("agent_event", function (msg) {
      try { addEvent(JSON.parse(msg.data)); } catch (_) {}
    });
  }

  loadRuns();
  setInterval(loadRuns, 10000);
  connect();
})();
