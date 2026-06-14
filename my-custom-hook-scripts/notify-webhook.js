#!/usr/bin/env node
// @argus-meta
// title: Notify webhook
// event: Stop
// runtime: node
// purpose: Slack / Discord / ntfy / Telegram / custom webhook when the agent finishes or needs attention. Rate-limited; silent without config.
// @end

// Stop / SubagentStop / Notification hook: posts a message to a Slack, Discord, ntfy,
// Telegram, or custom webhook when the agent finishes or needs attention. Complements
// stop.js (local macOS notification) for when you are away from the machine.
//
// Secrets stay in ~/.argus/notify.json — never in the repo's settings.json (a webhook
// URL in a committed hook command string is a leaked credential). Silent without config.
// Rate-limited via a state file so a burst of events can't spam the channel.
// Always exits 0 — a notification failure must never block the agent.
//
// Config (required to activate): ~/.argus/notify.json
//   {
//     "preset": "slack" | "discord" | "ntfy" | "telegram" | "custom",
//     "url": "https://hooks.slack.com/services/...",        // webhook / ntfy topic URL
//     "telegram_chat_id": "123456",                          // telegram only
//     "events": ["Stop"],                                    // which hook events to send
//     "min_interval_s": 60,
//     "timeout_ms": 4000
//   }
// telegram: url is "https://api.telegram.org/bot<TOKEN>" (script appends /sendMessage).
// custom: POSTs {"text": "<message>"} as JSON to url.

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const http = require('http');

const CONFIG_FILE = path.join(os.homedir(), '.argus', 'notify.json');
const STATE_FILE = path.join(os.homedir(), '.argus', 'notify-state.json');
const scriptLog = path.join(os.homedir(), '.argus', 'hook-scripts.log');

function logScript(level, msg) {
  try {
    fs.appendFileSync(scriptLog, `${new Date().toISOString()} notify-webhook.js ${level} ${msg}\n`);
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

function readConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    if (!text(parsed.url) || !text(parsed.preset)) return null;
    return {
      preset: text(parsed.preset),
      url: text(parsed.url),
      telegram_chat_id: text(parsed.telegram_chat_id),
      events:
        Array.isArray(parsed.events) && parsed.events.length > 0
          ? parsed.events.filter(e => typeof e === 'string')
          : ['Stop'],
      min_interval_s:
        Number.isFinite(parsed.min_interval_s) && parsed.min_interval_s >= 0
          ? parsed.min_interval_s
          : 60,
      timeout_ms:
        Number.isFinite(parsed.timeout_ms) && parsed.timeout_ms > 0 ? parsed.timeout_ms : 4000,
    };
  } catch (_) {
    return null;
  }
}

function rateLimited(minIntervalS) {
  if (minIntervalS === 0) return false;
  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (Number.isFinite(state.last_sent) && Date.now() - state.last_sent < minIntervalS * 1000) {
      return true;
    }
  } catch (_) {}
  return false;
}

function markSent() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ last_sent: Date.now() }));
  } catch (_) {}
}

function buildMessage(payload) {
  const event = text(payload.hook_event_name) || 'Stop';
  const where = text(payload.cwd) ? ` in ${ellipsis(payload.cwd, 60)}` : '';
  const detail =
    text(payload.last_assistant_message) ||
    text(payload.message) ||
    text(payload.response) ||
    text(payload.summary);
  const head =
    event === 'Notification'
      ? `Agent needs attention${where}`
      : `Agent ${event === 'SubagentStop' ? 'subagent ' : ''}finished${where}`;
  return detail ? `${head}\n${ellipsis(detail, 300)}` : head;
}

function buildRequest(config, message) {
  switch (config.preset) {
    case 'slack':
      return { url: config.url, body: JSON.stringify({ text: message }), json: true };
    case 'discord':
      return { url: config.url, body: JSON.stringify({ content: message }), json: true };
    case 'ntfy':
      return {
        url: config.url,
        body: message,
        json: false,
        headers: { Title: 'Argus agent notification' },
      };
    case 'telegram': {
      if (!config.telegram_chat_id) return null;
      return {
        url: `${config.url.replace(/\/$/, '')}/sendMessage`,
        body: JSON.stringify({ chat_id: config.telegram_chat_id, text: message }),
        json: true,
      };
    }
    case 'custom':
      return { url: config.url, body: JSON.stringify({ text: message }), json: true };
    default:
      return null;
  }
}

function post(req, timeoutMs) {
  return new Promise(resolve => {
    let parsed;
    try {
      parsed = new URL(req.url);
    } catch (_) {
      resolve(false);
      return;
    }
    const lib = parsed.protocol === 'http:' ? http : https;
    const request = lib.request(
      parsed,
      {
        method: 'POST',
        headers: {
          'Content-Type': req.json ? 'application/json' : 'text/plain; charset=utf-8',
          'Content-Length': Buffer.byteLength(req.body),
          ...(req.headers || {}),
        },
        timeout: timeoutMs,
      },
      res => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 300);
      }
    );
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => resolve(false));
    request.write(req.body);
    request.end();
  });
}

async function main() {
  const config = readConfig();
  if (!config) return; // unconfigured -> silent

  const payload = parsePayload(await readStdin());
  const event = text(payload.hook_event_name) || 'Stop';
  if (!config.events.includes(event)) return;
  if (rateLimited(config.min_interval_s)) {
    logScript('INFO', `rate limited, skipping ${event}`);
    return;
  }

  const req = buildRequest(config, buildMessage(payload));
  if (!req) {
    logScript('WARN', `preset ${config.preset} misconfigured`);
    return;
  }

  const ok = await post(req, config.timeout_ms);
  if (ok) {
    markSent();
    logScript('INFO', `${config.preset} notified for ${event}`);
  } else {
    logScript('WARN', `${config.preset} webhook failed for ${event}`);
  }
}

main()
  .catch(() => {
    logScript('ERROR', 'failed');
  })
  .finally(() => {
    process.exit(0);
  });
