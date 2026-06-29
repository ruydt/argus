#!/usr/bin/env node
// @argus-meta
// title: Argus session start
// author: ruydt
// events: SessionStart
// agents: claudecode, codex
// command: node ~/.argus/hooks/argus-activate.js
// purpose: Start the Argus server and show a liveness banner at session start.
// os: linux, macos, windows
// @end
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const db = path.join(os.homedir(), '.argus', 'argus.db');
const logPath = path.join(os.homedir(), '.argus', 'argus.log');
const scriptLog = path.join(os.homedir(), '.argus', 'hook-scripts.log');
const url = 'http://127.0.0.1:10804';
const binary = '/Users/duytran/.argus/bin/argus';
const isClaudeCode = process.env.CLAUDECODE === '1';

function isServerUp() {
  return new Promise(resolve => {
    const sock = net.createConnection({ host: '127.0.0.1', port: 10804 });
    sock.setTimeout(500);
    sock.on('connect', () => { sock.destroy(); resolve(true); });
    sock.on('error', () => resolve(false));
    sock.on('timeout', () => { sock.destroy(); resolve(false); });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function emit(msg) {
  if (isClaudeCode) {
    process.stdout.write(JSON.stringify({ systemMessage: msg }));
  } else {
    process.stdout.write(msg);
  }
}

function logScript(level, msg) {
  try {
    fs.appendFileSync(scriptLog, `${new Date().toISOString()} argus-activate.js ${level} ${msg}\n`);
  } catch (_) {}
}

// Launch the server detached so it outlives this hook process. Output goes to
// argus.log; the child is fully unref'd so the agent isn't held open.
function startServer() {
  try {
    fs.mkdirSync(path.dirname(db), { recursive: true });
  } catch (_) {}
  let out;
  try {
    out = fs.openSync(logPath, 'a');
  } catch (_) {
    out = 'ignore';
  }
  const child = spawn(binary, [], {
    detached: true,
    stdio: ['ignore', out, out],
    env: { ...process.env, DB_PATH: db, ADDR: '127.0.0.1:10804' },
  });
  child.unref();
}

async function main() {
  logScript('INFO', 'start');
  let up = await isServerUp();
  if (!up) {
    logScript('WARN', 'server offline; launching');
    startServer();
    await sleep(1200);
    up = await isServerUp();
  }
  if (!up) {
    logScript('ERROR', 'server offline after start attempt');
    emit(isClaudeCode ? '\x1b[1m\x1b[31mARGUS offline\x1b[0m' : 'ARGUS offline');
    return;
  }
  let msg;
  try {
    const result = execSync(
      `sqlite3 "${db}" "SELECT COUNT(*), COUNT(DISTINCT session_id) FROM hook_events"`,
      { encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim();
    const [events, sessions] = result.split('|');
    logScript('INFO', 'sqlite counts loaded');
    msg = `ARGUS live @ ${url} | ${parseInt(events, 10).toLocaleString()} events · ${sessions.trim()} sessions`;
  } catch (_) {
    logScript('WARN', 'sqlite counts unavailable');
    msg = `ARGUS live @ ${url}`;
  }
  emit(isClaudeCode ? '\x1b[35m' + msg + '\x1b[0m' : msg);
}

main().catch(err => {
  logScript('ERROR', `activation failed: ${err && err.message ? err.message : String(err)}`);
});
