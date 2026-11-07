// /live: runs from /live/api/runs, events from the SSE feed (/live/api/stream). Every value is
// written with textContent; nothing from the feed is parsed as HTML.
(function () {
  "use strict";
  var MAX_ROWS = 300;
  var tbody = document.getElementById("events");
  var empty = document.getElementById("events-empty");
  var runsEl = document.getElementById("runs");
  var runsEmpty = document.getElementById("runs-empty");
  var conn = document.getElementById("conn");
  var connText = document.getElementById("conn-text");
  var filterLabel = document.getElementById("filter-label");
  var allBtn = document.getElementById("run-all");
  var filter = null;

  var el = function (tag, text, cls) {
    var e = document.createElement(tag);
    if (text !== undefined && text !== null) e.textContent = String(text);
    if (cls) e.className = cls;
    return e;
  };
  var short = function (id) { return id && id.length > 14 ? id.slice(0, 6) + "…" + id.slice(-6) : id || ""; };
  var time = function (ts) { var d = new Date(ts); return isNaN(d) ? "" : d.toLocaleTimeString(); };
  var usd = function (v) { return typeof v === "number" ? "$" + v.toFixed(4) : ""; };
  var label = function (name) { return String(name || "").replace(/^agent_/, "").replace(/_/g, " "); };

  function detail(e) {
    var d = e.data || {};
    switch (e.event) {
      case "agent_tool_call": return (d.tool_call && d.tool_call.function ? d.tool_call.function.name : "tool") + " · " + (d.status || "");
      case "agent_model_call": return (d.model || "") + (d.latency_ms ? " · " + Math.round(d.latency_ms) + " ms" : "");
      case "agent_gate_decision": return (d.decision || "") + (d.reason ? " · " + d.reason : "");
      case "agent_approval": return d.choice || d.status || "";
      case "agent_turn_complete": return d.status || "";
      case "agent_outcome": return d.grade !== undefined ? "grade " + d.grade : (d.status || "");
      default: return d.platform || d.status || "";
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
    tr.className = "ev ev-" + e.event + (e.data && e.data.decision ? " dec-" + e.data.decision : "");
    if (e.harness_variant && e.harness_variant.label === "smoke") tr.classList.add("smoke");
    tr.appendChild(el("td", time(e.ts), "mono"));
    tr.appendChild(el("td", label(e.event)));
    var who = el("td", null, "mono");
    who.appendChild(el("span", short(e.run_id)));
    if (e.turn_id) who.appendChild(el("span", " / " + short(e.turn_id), "muted"));
    tr.appendChild(who);
    tr.appendChild(el("td", detail(e)));
    tr.appendChild(el("td", tokens(e), "num mono"));
    tr.appendChild(el("td", usd(e.data && e.data.cost_usd), "num mono"));
    if (filter && e.run_id !== filter) tr.hidden = true;
    tbody.insertBefore(tr, tbody.firstChild);
    while (tbody.children.length > MAX_ROWS) tbody.removeChild(tbody.lastChild);
    refreshEmpty();
  }

  function refreshEmpty() {
    var visible = Array.prototype.some.call(tbody.children, function (r) { return !r.hidden; });
    empty.hidden = visible;
  }

  function setFilter(runId) {
    filter = runId;
    allBtn.classList.toggle("active", !runId);
    Array.prototype.forEach.call(runsEl.querySelectorAll("button"), function (b) { b.classList.toggle("active", b.dataset.run === runId); });
    Array.prototype.forEach.call(tbody.children, function (r) { r.hidden = !!runId && r.dataset.run !== runId; });
    filterLabel.textContent = runId ? "· " + short(runId) : "";
    refreshEmpty();
  }
  allBtn.addEventListener("click", function () { setFilter(null); });

  function loadRuns() {
    fetch("/live/api/runs?limit=20").then(function (r) { return r.ok ? r.json() : { runs: [] }; }).then(function (body) {
      runsEl.textContent = "";
      (body.runs || []).forEach(function (run) {
        var li = el("li");
        var b = el("button", null, "run" + (run.run_id === filter ? " active" : ""));
        b.type = "button";
        b.dataset.run = run.run_id;
        b.appendChild(el("span", short(run.run_id), "mono"));
        if (run.variant_label) b.appendChild(el("span", run.variant_label, "tag"));
        b.appendChild(el("span", run.turn_count + " turns · " + run.tool_calls + " tools · " + usd(run.cost_usd), "muted small"));
        b.addEventListener("click", function () { setFilter(run.run_id); });
        li.appendChild(b);
        runsEl.appendChild(li);
      });
      runsEmpty.hidden = (body.runs || []).length > 0;
    }).catch(function () {});
  }

  function connect() {
    if (!window.EventSource) { connText.textContent = "This browser cannot stream events."; return; }
    var es = new EventSource("/live/api/stream");
    es.addEventListener("open", function () { conn.classList.add("on"); connText.textContent = "Live"; });
    es.addEventListener("error", function () { conn.classList.remove("on"); connText.textContent = "Reconnecting…"; });
    es.addEventListener("agent_event", function (msg) {
      try { addEvent(JSON.parse(msg.data)); } catch (_) {}
    });
  }

  loadRuns();
  setInterval(loadRuns, 10000);
  connect();
})();
