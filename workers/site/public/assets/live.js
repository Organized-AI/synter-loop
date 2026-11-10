const statusEl = document.querySelector("#feed-status");
const runsEl = document.querySelector("#runs");
const setStatus = (text, error = false) => { if (!statusEl) return; statusEl.textContent = text; statusEl.classList.toggle("error", error); };
function escapeText(value) {
  const span = document.createElement("span");
  span.textContent = String(value ?? "");
  return span.innerHTML;
}
function renderRuns(runs) {
  if (!runsEl) return;
  if (!Array.isArray(runs) || !runs.length) { runsEl.innerHTML = '<div class="empty-state">No runs indexed yet. Capture is opt-in; this view never fabricates activity.</div>'; return; }
  runsEl.innerHTML = runs.map((run) => `<article class="run-card"><div><div class="run-id">${escapeText(run.run_id)}</div><div class="run-meta"><span>first ${escapeText(run.first_seen)}</span><span>last ${escapeText(run.last_seen)}</span></div></div><div class="run-count">${Number(run.event_count) || 0}<small> events</small></div></article>`).join("");
  const total = runs.reduce((sum, run) => sum + (Number(run.event_count) || 0), 0);
  const holdouts = runs.filter((run) => Number(run.holdout) === 1).length;
  const count = document.querySelector("#run-count"); if (count) count.textContent = String(runs.length);
  const events = document.querySelector("#event-count"); if (events) events.textContent = String(total);
  const holdoutCount = document.querySelector("#holdout-count"); if (holdoutCount) holdoutCount.textContent = String(holdouts);
}
async function refresh() {
  setStatus("Refreshing…");
  try {
    const response = await fetch("/api/live", { headers: { accept: "application/json" }, cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
    renderRuns(data.runs || []);
    setStatus(`Connected · ${data.runs?.length || 0} run(s)`);
  } catch (error) {
    renderRuns([]);
    setStatus(`Unavailable · ${error.message || "capture feed error"}`, true);
  }
}
document.querySelector("#refresh")?.addEventListener("click", refresh);
refresh();
