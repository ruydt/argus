#!/usr/bin/env node
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const scriptLog = path.join(os.homedir(), '.argus', 'hook-scripts.log');

function logScript(level, msg) {
  try {
    fs.appendFileSync(scriptLog, `${new Date().toISOString()} stop.js ${level} ${msg}\n`);
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
    return parsed && typeof parsed === 'object' ? parsed : {};
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

function displayNotification({ title, subtitle, message }) {
  const script = [
    'display notification ' + JSON.stringify(message),
    'with title ' + JSON.stringify(title),
    subtitle ? 'subtitle ' + JSON.stringify(subtitle) : '',
    'sound name "default"',
  ]
    .filter(Boolean)
    .join(' ');

  try {
    const child = spawn('/usr/bin/osascript', ['-e', script], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  } catch (_) {}
}

async function main() {
  const payload = parsePayload(await readStdin());
  const eventName = text(payload.hook_event_name) || 'Stop';
  logScript('INFO', eventName);
  const title = eventName === 'StopFailure' ? 'Argus: stop failed' : 'Argus: session stopped';
  const subtitle = text(payload.cwd) || text(payload.transcript_path) || text(payload.session_id);
  const message = stopMessage(payload);

  displayNotification({
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
