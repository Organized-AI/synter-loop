CREATE TABLE IF NOT EXISTS agent_runs (
  run_id TEXT PRIMARY KEY,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  event_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS agent_events (
  event_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(run_id),
  turn_id TEXT,
  event_type TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  plugin_version TEXT NOT NULL DEFAULT '',
  holdout INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS agent_events_run_timestamp
  ON agent_events(run_id, timestamp);
CREATE INDEX IF NOT EXISTS agent_runs_last_seen
  ON agent_runs(last_seen DESC);
