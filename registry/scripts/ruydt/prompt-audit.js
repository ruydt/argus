#!/usr/bin/env node
// @argus-meta
// title: Prompt audit log
// author: ruydt
// events: UserPromptSubmit
// agents: claudecode, codex
// command: node ~/.argus/hooks/prompt-audit.js
// purpose: Append every user prompt (timestamp, session, cwd, first line) to ~/.argus/prompt-audit.log. Never injects context.
// os: linux, macos, windows
// @end

// UserPromptSubmit hook: keeps a local audit trail of what you asked each agent. Appends
// one line per prompt to ~/.argus/prompt-audit.log — it does NOT inject anything into the
// model (use registry `inject-context` for that). Emits no stdout, so it can't alter the
// prompt. Fail-open: any error still exits 0.
//
// Config (optional): ~/.argus/prompt-audit.json
//   { "full": false, "max_chars": 200, "logfile": "~/.argus/prompt-audit.log" }
//   full:true records the entire prompt (newlines escaped to \\n) instead of the first line.

const fs = require('fs');
const os = require('os');
const path = require('path');

const CONFIG_FILE = path.join(os.homedir(), '.argus', 'prompt-audit.json');
const scriptLog = path.join(os.homedir(), '.argus', 'hook-scripts.log');
const logAgent = process.env.CLAUDECODE === '1' ? 'claudecode' : 'codex';
let logSession = '-';

function logScript(level, msg) {
  try {
    fs.appendFileSync(scriptLog, `${new Date().toISOString()} ${logAgent} ${logSession} prompt-audit.js ${level} ${msg}\n`);
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
      full: parsed.full === true,
      max_chars:
        Number.isFinite(parsed.max_chars) && parsed.max_chars > 0 ? parsed.max_chars : 200,
      logfile:
        expandHome(parsed.logfile) || path.join(os.homedir(), '.argus', 'prompt-audit.log'),
    };
  } catch (_) {
    return { full: false, max_chars: 200, logfile: path.join(os.homedir(), '.argus', 'prompt-audit.log') };
  }
}

async function main() {
  const payload = parsePayload(await readStdin());
  const config = readConfig();
  const prompt =
    typeof payload.prompt === 'string'
      ? payload.prompt
      : typeof payload.user_prompt === 'string'
        ? payload.user_prompt
        : '';
  if (!prompt.trim()) return;

  const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();
  let text = config.full
    ? prompt.replace(/\r?\n/g, '\\n')
    : prompt.split('\n')[0];
  text = text.trim();
  if (text.length > config.max_chars) text = text.slice(0, config.max_chars) + '…';

  const line = `${new Date().toISOString()} ${logAgent} ${logSession} ${cwd} | ${text}\n`;
  try {
    fs.appendFileSync(config.logfile, line);
    logScript('INFO', `logged prompt (${prompt.length} chars)`);
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
