#!/usr/bin/env node
// @argus-meta
// title: Cost warning
// events: SessionStart
// agents: claudecode, codex
// command: node ~/.argus/hooks/cost-warn.js
// purpose: Warn when token usage in the rolling 5h window crosses a threshold. Silent otherwise.
// os: linux, macos
// @end
// OS: macOS / Linux (POSIX). Shells out to the `sqlite3` CLI — not Windows-compatible.

// SessionStart hook: warns when token usage in the rolling 5-hour window crosses a
// threshold, using the local argus database. Approximates the billing window — it
// does not track exact billing-block boundaries. Silent when under the warn level
// or when the database is unavailable (fail-open).
// Config (optional): ~/.argus/cost-warn.json { "threshold_tokens": 5000000, "warn_pct": 80 }

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const DB_FILE = path.join(os.homedir(), '.argus', 'argus.db');
const CONFIG_FILE = path.join(os.homedir(), '.argus', 'cost-warn.json');
const scriptLog = path.join(os.homedir(), '.argus', 'hook-scripts.log');
const logAgent = process.env.CLAUDECODE === '1' ? 'claudecode' : 'codex';
let logSession = '-';
const isClaudeCode = process.env.CLAUDECODE === '1';

const DEFAULTS = { threshold_tokens: 5000000, warn_pct: 80 };

function logScript(level, msg) {
  try {
    fs.appendFileSync(scriptLog, `${new Date().toISOString()} ${logAgent} ${logSession} cost-warn.js ${level} ${msg}\n`);
  } catch (_) {}
}

function readConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return {
      threshold_tokens:
        Number.isFinite(parsed.threshold_tokens) && parsed.threshold_tokens > 0
          ? parsed.threshold_tokens
          : DEFAULTS.threshold_tokens,
      warn_pct:
        Number.isFinite(parsed.warn_pct) && parsed.warn_pct > 0 && parsed.warn_pct <= 100
          ? parsed.warn_pct
          : DEFAULTS.warn_pct,
    };
  } catch (_) {
    return { ...DEFAULTS };
  }
}

function formatTokens(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(0) + 'k';
  return String(n);
}

function emit(msg) {
  if (isClaudeCode) {
    process.stdout.write(JSON.stringify({ systemMessage: msg }) + '\n');
  } else {
    process.stdout.write(msg + '\n');
  }
}

function main() {
  const config = readConfig();

  // Epoch comparison: argus stores RFC3339 ("...T...Z"), datetime() emits space-separated —
  // naive string comparison would match the whole day instead of the 5-hour window.
  // cache_read_tokens is intentionally excluded: cache reads dominate raw token volume at a
  // fraction of the price, so including them would swamp the cost signal.
  const query =
    "SELECT COALESCE(SUM(input_tokens + output_tokens + cache_creation_tokens), 0), COUNT(*) " +
    "FROM sessions WHERE strftime('%s', last_seen_at) >= strftime('%s', 'now', '-5 hours')";

  let total = 0;
  let sessions = 0;
  try {
    const result = execSync(`sqlite3 "${DB_FILE}" "${query}"`, {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    const [totalRaw, sessionsRaw] = result.split('|');
    total = parseInt(totalRaw, 10) || 0;
    sessions = parseInt(sessionsRaw, 10) || 0;
  } catch (_) {
    logScript('WARN', 'argus db unavailable, staying silent');
    return;
  }

  const warnLevel = Math.floor((config.threshold_tokens * config.warn_pct) / 100);
  const pct = Math.round((total / config.threshold_tokens) * 100);
  logScript('INFO', `window total=${total} sessions=${sessions} pct=${pct}`);

  if (total < warnLevel) return;

  emit(
    `⚠ Token usage high: ${formatTokens(total)} of ${formatTokens(config.threshold_tokens)} threshold (${pct}%) across ${sessions} session(s) in the last 5h window.`
  );
}

try {
  main();
} catch (_) {
  logScript('ERROR', 'script failure, failing open');
}
