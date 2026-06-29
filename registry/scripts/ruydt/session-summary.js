#!/usr/bin/env node
// @argus-meta
// title: Session summary log
// author: ruydt
// events: Stop
// agents: claudecode, codex
// command: node ~/.argus/hooks/session-summary.js
// purpose: On Stop, append a JSONL session record (session, cwd, git dirty count, last message) to ~/.argus/session-log.jsonl.
// os: linux, macos, windows
// @end

// Stop hook: writes a compact one-object-per-line record every time the agent stops, so
// you build a local history of sessions (where, how dirty the tree was, last thing said).
// Ported/simplified from the ECC "Session summary" hook — standalone, no plugin store.
// Side-effect only: never blocks, always exits 0. git is best-effort (skipped if absent).
//
// Config (optional): ~/.argus/session-summary.json
//   { "git": true, "logfile": "~/.argus/session-log.jsonl", "max_message_chars": 200 }

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const CONFIG_FILE = path.join(os.homedir(), '.argus', 'session-summary.json');
const scriptLog = path.join(os.homedir(), '.argus', 'hook-scripts.log');
const logAgent = process.env.CLAUDECODE === '1' ? 'claudecode' : 'codex';
let logSession = '-';

function logScript(level, msg) {
  try {
    fs.appendFileSync(scriptLog, `${new Date().toISOString()} ${logAgent} ${logSession} session-summary.js ${level} ${msg}\n`);
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

function expandHome(p) {
  if (typeof p !== 'string' || !p) return '';
  return p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p;
}

function readConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return {
      git: parsed.git !== false,
      logfile:
        expandHome(parsed.logfile) || path.join(os.homedir(), '.argus', 'session-log.jsonl'),
      max_message_chars:
        Number.isFinite(parsed.max_message_chars) && parsed.max_message_chars > 0
          ? parsed.max_message_chars
          : 200,
    };
  } catch (_) {
    return {
      git: true,
      logfile: path.join(os.homedir(), '.argus', 'session-log.jsonl'),
      max_message_chars: 200,
    };
  }
}

function ellipsis(value, max) {
  const clean = (typeof value === 'string' ? value : '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max) + '…';
}

function gitDirtyCount(cwd) {
  try {
    const out = execFileSync('git', ['status', '--porcelain'], {
      cwd,
      encoding: 'utf8',
      timeout: 1500,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split('\n').filter(l => l.trim().length > 0).length;
  } catch (_) {
    return null; // not a repo / git missing
  }
}

async function main() {
  const payload = parsePayload(await readStdin());
  const config = readConfig();
  const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();

  const record = {
    ts: new Date().toISOString(),
    agent: logAgent,
    session: typeof payload.session_id === 'string' ? payload.session_id : '',
    event: typeof payload.hook_event_name === 'string' ? payload.hook_event_name : 'Stop',
    cwd,
    dirty: config.git ? gitDirtyCount(cwd) : null,
    last: ellipsis(
      payload.last_assistant_message || payload.response || payload.message || '',
      config.max_message_chars
    ),
  };

  try {
    fs.appendFileSync(config.logfile, JSON.stringify(record) + '\n');
    logScript('INFO', `session record written (dirty=${record.dirty})`);
  } catch (err) {
    logScript('WARN', `append failed: ${err && err.message ? err.message : String(err)}`);
  }
}

main()
  .catch(() => {
    logScript('ERROR', 'failed');
  })
  .finally(() => {
    process.exit(0);
  });
