-- agent-capture run index. R2 `agent-runs` holds the raw JSONL (one object per turn);
-- these tables index it. Turn and run rollups are recomputed from source rows on every
-- write, never incremented, so a retried POST cannot double count.

CREATE TABLE IF NOT EXISTS runs (
  run_id            TEXT PRIMARY KEY,
  session_id        TEXT NOT NULL,
  variant_id        TEXT,
  variant_label     TEXT,
  model             TEXT,
  first_ts          TEXT NOT NULL,
  last_ts           TEXT NOT NULL,
  turn_count        INTEGER NOT NULL DEFAULT 0,
  event_count       INTEGER NOT NULL DEFAULT 0,
  tool_calls        INTEGER NOT NULL DEFAULT 0,
  input_tokens      INTEGER NOT NULL DEFAULT 0,
  output_tokens     INTEGER NOT NULL DEFAULT 0,
  cache_tokens      INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens  INTEGER NOT NULL DEFAULT 0,
  cost_usd          REAL    NOT NULL DEFAULT 0,
  updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS runs_last_ts ON runs (last_ts DESC);

-- turn_key is the turn_id, or "_session" for session-scoped events.
CREATE TABLE IF NOT EXISTS turns (
  run_id            TEXT NOT NULL,
  turn_key          TEXT NOT NULL,
  r2_key            TEXT NOT NULL,
  event_count       INTEGER NOT NULL,
  first_ts          TEXT NOT NULL,
  last_ts           TEXT NOT NULL,
  status            TEXT,
  tool_calls        INTEGER NOT NULL DEFAULT 0,
  input_tokens      INTEGER NOT NULL DEFAULT 0,
  output_tokens     INTEGER NOT NULL DEFAULT 0,
  cache_tokens      INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens  INTEGER NOT NULL DEFAULT 0,
  cost_usd          REAL    NOT NULL DEFAULT 0,
  updated_at        TEXT NOT NULL,
  PRIMARY KEY (run_id, turn_key)
);

-- Metadata-only copy of each event for the /live feed. seq is the feed cursor.
CREATE TABLE IF NOT EXISTS feed (
  seq       INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id  TEXT NOT NULL UNIQUE,
  run_id    TEXT NOT NULL,
  turn_key  TEXT NOT NULL,
  event     TEXT NOT NULL,
  ts        TEXT NOT NULL,
  meta      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS feed_run ON feed (run_id, seq);

-- One row per event: what the sGTM relay did with it (skipped | sent | failed).
CREATE TABLE IF NOT EXISTS forwards (
  event_id     TEXT PRIMARY KEY,
  status       TEXT NOT NULL,
  http_status  INTEGER,
  attempts     INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS forwards_status ON forwards (status);
