#!/usr/bin/env node
// Repo guards for AGENTS.md rules that a test can check:
//   rule 1  - no AI attribution in commit messages or tracked files; commits authored by Jordan
//   rule 4  - no .env file tracked
//   rule 10 - .pi/mcp.json keeps Synter hidden and read tools only
//   catalog rule 17 - no compiled binaries or bytecode tracked
// Usage: node scripts/check-guards.mjs   (GUARDS_BASE=<ref> to choose the commit range base)
import { execFileSync } from "node:child_process";
import { existsSync, openSync, readFileSync, readSync, closeSync, statSync } from "node:fs";

const failures = [];
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const fail = (rule, msg) => failures.push(`${rule}: ${msg}`);

// rule 10: Synter stays hidden and read-only for Pi.
const READ_TOOLS = new Set([
  "search_actions", "get_connection_status", "get_plugin_info", "get_*", "list_*", "pull_*_performance",
  "ga4_get_*", "gtm_get_resources", "run_gaql_query", "angstrom_verify_output", "measure_incrementality",
]);
const mcp = JSON.parse(readFileSync(".pi/mcp.json", "utf8"));
const synter = mcp.mcpServers?.synter;
if (!synter) fail("rule 10", ".pi/mcp.json has no synter server");
else {
  if (synter.exposure !== "hidden") fail("rule 10", `synter exposure is "${synter.exposure}", must be "hidden"`);
  for (const key of Object.keys(synter.toolExposure ?? {})) {
    if (!READ_TOOLS.has(key)) fail("rule 10", `.pi/mcp.json exposes "${key}", which is not on the read-only allow-list`);
  }
  if (JSON.stringify(synter.headers ?? {}).match(/syn_[A-Za-z0-9]{6,}/)) fail("rule 4", ".pi/mcp.json contains a literal Synter key");
}

// rule 4: no env files tracked.
const tracked = git("ls-files", "-z").split("\0").filter(Boolean);
for (const f of tracked) {
  const base = f.split("/").pop();
  if ((base === ".env" || base.startsWith(".env.") || base === ".dev.vars") && base !== ".env.example") fail("rule 4", `${f} is tracked`);
}

// catalog rule 17: no binaries or bytecode.
const MAGIC = [
  [Buffer.from([0x7f, 0x45, 0x4c, 0x46]), "ELF"],
  [Buffer.from([0xcf, 0xfa, 0xed, 0xfe]), "Mach-O"],
  [Buffer.from([0xce, 0xfa, 0xed, 0xfe]), "Mach-O"],
  [Buffer.from([0xca, 0xfe, 0xba, 0xbe]), "Mach-O universal"],
  [Buffer.from([0x00, 0x61, 0x73, 0x6d]), "WebAssembly"],
  [Buffer.from([0x4d, 0x5a]), "PE/MZ"],
];
for (const f of tracked) {
  if (/\.(pyc|pyo)$/.test(f)) { fail("catalog 17", `${f} is Python bytecode`); continue; }
  if (!existsSync(f) || !statSync(f).isFile()) continue;
  const fd = openSync(f, "r");
  const head = Buffer.alloc(4);
  const n = readSync(fd, head, 0, 4, 0);
  closeSync(fd);
  for (const [magic, kind] of MAGIC) {
    if (n >= magic.length && head.subarray(0, magic.length).equals(magic)) fail("catalog 17", `${f} looks like a ${kind} binary`);
  }
}

// rule 1: no AI attribution. Patterns are assembled so this file does not match itself.
const ATTRIBUTION = [
  new RegExp("Co-Authored" + "-By:\\s*(Claude|.*anthropic|.*openai|.*noreply@.*ai)", "i"),
  new RegExp("^\\s*Claude" + "-Session:", "im"),
  new RegExp("Generated with \\[?(Claude|Codex|Pi)", "i"),
  new RegExp("\\u{1F916} Generated", "u"),
];
for (const f of tracked) {
  if (!existsSync(f) || !statSync(f).isFile() || statSync(f).size > 2_000_000) continue;
  const text = readFileSync(f, "utf8");
  for (const re of ATTRIBUTION) if (re.test(text)) fail("rule 1", `${f} contains AI attribution (${re.source})`);
}

const base = process.env.GUARDS_BASE ?? (() => {
  try { git("rev-parse", "--verify", "--quiet", "origin/main"); return "origin/main"; } catch { return null; }
})();
if (base) {
  const range = `${base}..HEAD`;
  // --no-merges: a pull_request checkout is GitHub's synthetic merge commit, not one of ours.
  const log = git("log", "--no-merges", "--format=%H%x1f%an <%ae>%x1f%B%x1e", range);
  for (const entry of log.split("\x1e").map((s) => s.trim()).filter(Boolean)) {
    const [sha, author, body] = entry.split("\x1f");
    for (const re of ATTRIBUTION) if (re.test(body ?? "")) fail("rule 1", `commit ${sha.slice(0, 7)} message contains AI attribution`);
    const okAuthor = author === "Jordan Hill <jordan@bluehighlightedtext.com>" || /dependabot\[bot\]/.test(author);
    if (!okAuthor) fail("rule 1", `commit ${sha.slice(0, 7)} authored by ${author}`);
  }
}

if (failures.length) {
  console.error(`guards: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`guards: ok (${tracked.length} tracked files${base ? `, commits ${base}..HEAD` : ""})`);
