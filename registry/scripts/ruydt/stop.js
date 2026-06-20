#!/usr/bin/env node
// @argus-meta
// title: Stop notification
// events: Stop
// agents: claudecode, codex
// command: node ~/.argus/hooks/stop.js
// purpose: Local notification when the agent finishes.
// os: macos
// @end

// Stop hook: posts a macOS notification when the agent session stops, so you know
// it's time to come back to the terminal. Reads the Stop payload from stdin, builds
// title/subtitle/message from it (last assistant message, cwd, session id), and
// displays it via /usr/bin/osascript. Always exits 0 — a notification failure must
// never block the agent. Activity is logged to ~/.argus/hook-scripts.log.

// NOTE on screen sharing/streaming (e.g. Discord streams, screen mirroring):
// macOS hides notification banners while the display is shared — the script still
// "succeeds" (exit 0, sound plays, notification lands in Notification Center) but
// nothing slides out. Override: System Settings → Notifications → enable
// "Allow notifications when mirroring or sharing the display". Privacy tradeoff:
// with the override ON, stream viewers can see notification content (cwd paths,
// last-message snippets).
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const scriptLog = path.join(os.homedir(), '.argus', 'hook-scripts.log');
const logAgent = process.env.CLAUDECODE === '1' ? 'claudecode' : 'codex';
let logSession = '-';

function logScript(level, msg) {
  try {
    fs.appendFileSync(scriptLog, `${new Date().toISOString()} ${logAgent} ${logSession} stop.js ${level} ${msg}\n`);
  } catch (_) {}
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
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

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function ellipsis(value, max) {
  const clean = text(value).replace(/\s+/g, ' ');
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 3) + '...';
}

function stopMessage(payload) {
  const response =
    text(payload.last_assistant_message) ||
    text(payload.response) ||
    text(payload.message) ||
    text(payload.summary);
  if (response) return ellipsis(response, 160);

  const session = text(payload.session_id) || text(payload.session) || text(payload.conversation_id);
  if (session) return `Session ${ellipsis(session, 80)} stopped.`;

  return 'Agent stopped.';
}

function runNotifier(command, args, name) {
  return new Promise((resolve) => {
    let stderr = '';
    let child;
    try {
      child = spawn(command, args, {
        stdio: ['ignore', 'ignore', 'pipe'],
      });
    } catch (err) {
      logScript('WARN', `${name} spawn failed: ${err && err.message ? err.message : String(err)}`);
      resolve(false);
      return;
    }

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (err) => {
      logScript('WARN', `${name} failed: ${err && err.message ? err.message : String(err)}`);
      resolve(false);
    });
    child.on('close', (code, signal) => {
      if (code === 0) {
        logScript('INFO', `${name} notified`);
        resolve(true);
        return;
      }
      const detail = stderr.trim().replace(/\s+/g, ' ').slice(0, 240);
      logScript('WARN', `${name} exit ${code}${signal ? ` signal ${signal}` : ''}${detail ? `: ${detail}` : ''}`);
      resolve(false);
    });
  });
}

async function displayNotification({ title, subtitle, message }) {
  const script = [
    'display notification ' + JSON.stringify(message),
    'with title ' + JSON.stringify(title),
    subtitle ? 'subtitle ' + JSON.stringify(subtitle) : '',
    'sound name "default"',
  ]
    .filter(Boolean)
    .join(' ');

  await runNotifier('/usr/bin/osascript', ['-e', script], 'osascript');
}

async function main() {
  const payload = parsePayload(await readStdin());
  const eventName = text(payload.hook_event_name) || 'Stop';
  logScript('INFO', eventName);
  const title = eventName === 'StopFailure' ? 'Argus: stop failed' : 'Argus: session stopped';
  const subtitle = text(payload.cwd) || text(payload.transcript_path) || text(payload.session_id);
  const message = stopMessage(payload);

  await displayNotification({
    title,
    subtitle: subtitle ? ellipsis(subtitle, 80) : '',
    message,
  });
}

main().catch(() => {
  logScript('ERROR', 'failed');
}).finally(() => {
  process.exit(0);
});
