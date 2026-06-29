#!/usr/bin/env node
// @argus-meta
// title: Compact reminder
// author: ruydt
// events: PreToolUse
// agents: claudecode, codex
// command: node ~/.argus/hooks/compact-reminder.js
// matcher: Edit|Write|MultiEdit
// purpose: Every N edit tool-calls in a session, remind to run /compact to keep context lean. Never blocks.
// os: linux, macos, windows
// @end

// PreToolUse hook (matcher: Edit|Write|MultiEdit): counts edit tool-calls per session in a
// small state file and, every N calls (default 50), prints a reminder to run /compact.
// Ported from the ECC "Strategic compact" hook. Always non-blocking: it passes the tool
// through and only writes the reminder to stderr (shown in the argus simulator / transcript).
// Fail-open: any error exits 0.
//
// Config (optional): ~/.argus/compact-reminder.json
//   { "every": 50 }
//
// State: ~/.argus/compact-counter.json  { "<session8>": <count>, ... } (auto-pruned).

const fs = require('fs');
const os = require('os');
const path = require('path');

const CONFIG_FILE = path.join(os.homedir(), '.argus', 'compact-reminder.json');
const STATE_FILE = path.join(os.homedir(), '.argus', 'compact-counter.json');
const scriptLog = path.join(os.homedir(), '.argus', 'hook-scripts.log');
const logAgent = process.env.CLAUDECODE === '1' ? 'claudecode' : 'codex';
let logSession = '-';

function logScript(level, msg) {
  try {
    fs.appendFileSync(scriptLog, `${new Date().toISOString()} ${logAgent} ${logSession} compact-reminder.js ${level} ${msg}\n`);
  } catch (_) {}
}

function readStdin() {
  return new Promise(resolve => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
  });
}

function parsePayload(raw) {
  try {
    const parsed = JSON.parse(raw || '{}');
    const obj = parsed && typeof parsed === 'object' ? parsed : {};
    logSession = typeof obj.session_id === 'string' && obj.session_id ? obj.session_id.slice(0, 8) : '-';
    return obj;
  } catch (_) {
    return {};
  }
}

function readConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    const every = Number.isFinite(parsed.every) && parsed.every > 0 ? Math.floor(parsed.every) : 50;
    return { every };
  } catch (_) {
    return { every: 50 };
  }
}

function readState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function writeState(state) {
  try {
    // Prune if the map grows unbounded across many sessions.
    const keys = Object.keys(state);
    if (keys.length > 200) {
      for (const k of keys.slice(0, keys.length - 100)) delete state[k];
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(state));
  } catch (_) {}
}

function pass() {
  process.stdout.write('{}\n');
}

async function main() {
  const payload = parsePayload(await readStdin());
  const config = readConfig();
  const key =
    typeof payload.session_id === 'string' && payload.session_id
      ? payload.session_id.slice(0, 8)
      : 'unknown';

  const state = readState();
  const count = (Number.isFinite(state[key]) ? state[key] : 0) + 1;
  state[key] = count;
  writeState(state);

  if (count % config.every === 0) {
    logScript('INFO', `reminder at ${count} edits (session ${key})`);
    process.stderr.write(
      `[compact-reminder] ${count} edits this session — consider running /compact to trim context and keep the agent sharp.\n`
    );
  }

  pass();
}

main().catch(() => {
  logScript('ERROR', 'script failure, failing open');
  process.stdout.write('{}\n');
});
