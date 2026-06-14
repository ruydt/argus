#!/usr/bin/env node
// @argus-meta
// title: Argus liveness banner
// event: SessionStart
// runtime: node
// purpose: Argus liveness banner with event/session counts at session start.
// @end

const { execSync } = require('child_process');
const os = require('os');
const path = require('path');

const db = path.join(os.homedir(), '.argus', 'argus.db');
const url = 'http://127.0.0.1:10804';
const isClaudeCode = process.env.CLAUDECODE === '1';
const scriptLog = path.join(os.homedir(), '.argus', 'hook-scripts.log');

function logScript(level, msg) {
  try {
    require('fs').appendFileSync(scriptLog, `${new Date().toISOString()} argus-activate-local.js ${level} ${msg}\n`);
  } catch (_) {}
}

function emit(msg) {
  if (isClaudeCode) {
    process.stdout.write(JSON.stringify({ systemMessage: msg }));
  } else {
    process.stdout.write(msg);
  }
}

logScript('INFO', 'start');

let msg;
try {
  const result = execSync(
    `sqlite3 "${db}" "SELECT COUNT(*), COUNT(DISTINCT session_id) FROM hook_events"`,
    { encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'ignore'] }
  ).trim();
  const [events, sessions] = result.split('|');
  msg = `ARGUS live @ ${url} | ${parseInt(events, 10).toLocaleString()} events · ${sessions.trim()} sessions`;
} catch (_) {
  logScript('WARN', 'sqlite counts unavailable');
  msg = `ARGUS live @ ${url}`;
}

logScript('INFO', 'sqlite counts loaded');
emit(isClaudeCode ? '\x1b[1m\x1b[32m' + msg + '\x1b[0m' : msg);
