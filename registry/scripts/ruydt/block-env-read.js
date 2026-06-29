#!/usr/bin/env node
// @argus-meta
// title: Block secret-file reads
// author: ruydt
// events: PreToolUse
// agents: claudecode, codex
// command: node ~/.argus/hooks/block-env-read.js
// matcher: Read
// purpose: Deny reading .env, private keys, and credential files so secrets never enter the agent transcript.
// os: linux, macos, windows
// @end

// PreToolUse hook (matcher: Read): denies reading files that typically hold secrets
// (.env, *.pem, id_rsa, credentials, .npmrc, ~/.ssh/* private keys, ...) so their
// contents never land in the agent's context/transcript. Public keys (*.pub) and
// example envs (.env.example/.sample/.template/.dist/.defaults) are allowed.
// Complements registry `protect-secrets` (which scans WRITES) — this blocks READS.
// Fail-open: any script error exits 0.
//
// Config (optional): ~/.argus/block-env-read.json
//   { "extra": ["<regex on path>"], "allow": ["<regex on path>"] }

const fs = require('fs');
const os = require('os');
const path = require('path');

const CONFIG_FILE = path.join(os.homedir(), '.argus', 'block-env-read.json');
const scriptLog = path.join(os.homedir(), '.argus', 'hook-scripts.log');
const logAgent = process.env.CLAUDECODE === '1' ? 'claudecode' : 'codex';
let logSession = '-';
const isClaudeCode = process.env.CLAUDECODE === '1';

const SECRET_EXT = new Set(['.pem', '.key', '.p12', '.pfx', '.keystore', '.jks', '.asc', '.ppk']);
const SECRET_BASENAMES = new Set([
  'credentials', '.netrc', '.pgpass', '.npmrc', '.pypirc', '.dockercfg',
  '.dockerconfigjson', 'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519',
]);
const ENV_ALLOW_SUFFIX = new Set(['example', 'sample', 'template', 'dist', 'defaults']);
const SSH_ALLOW = new Set(['known_hosts', 'known_hosts.old', 'config', 'authorized_keys']);

function logScript(level, msg) {
  try {
    fs.appendFileSync(scriptLog, `${new Date().toISOString()} ${logAgent} ${logSession} block-env-read.js ${level} ${msg}\n`);
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

function toRegexList(values) {
  const out = [];
  if (!Array.isArray(values)) return out;
  for (const value of values) {
    if (typeof value !== 'string' || !value) continue;
    try {
      out.push(new RegExp(value));
    } catch (_) {
      logScript('WARN', `invalid config regex skipped: ${value.slice(0, 80)}`);
    }
  }
  return out;
}

function readConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return { extra: toRegexList(parsed.extra), allow: toRegexList(parsed.allow) };
  } catch (_) {
    return { extra: [], allow: [] };
  }
}

// Returns a reason string if the path looks like secret material, else ''.
function classify(filePath) {
  const p = filePath.replace(/\\/g, '/');
  const base = p.slice(p.lastIndexOf('/') + 1).toLowerCase();
  if (base.endsWith('.pub')) return ''; // public key, safe to read

  if (base === '.env') return '.env file';
  if (base.startsWith('.env.')) {
    const suffix = base.slice(5);
    return ENV_ALLOW_SUFFIX.has(suffix) ? '' : '.env file';
  }
  if (SECRET_BASENAMES.has(base)) return 'credential / private-key file';
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 ? base.slice(dot) : '';
  if (SECRET_EXT.has(ext)) return `${ext} key/cert file`;
  if (/^secrets?\.(json|ya?ml|toml|env)$/.test(base)) return 'secrets file';
  if (/(^|\/)\.ssh\//.test(p) && !SSH_ALLOW.has(base)) return 'SSH key material';
  if (/(^|\/)\.aws\/credentials$/.test(p)) return 'AWS credentials';
  if (/(^|\/)\.gnupg\//.test(p)) return 'GPG key material';
  return '';
}

function pass() {
  process.stdout.write('{}\n');
}

function deny(reason, filePath) {
  logScript('WARN', `deny: ${reason} | ${filePath.slice(0, 200)}`);
  if (isClaudeCode) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: reason,
        },
      }) + '\n'
    );
    return;
  }
  process.stderr.write(reason + '\n');
  process.exit(2);
}

async function main() {
  const payload = parsePayload(await readStdin());
  const input =
    payload.tool_input && typeof payload.tool_input === 'object' ? payload.tool_input : {};
  const filePath = typeof input.file_path === 'string' ? input.file_path : '';
  if (!filePath) {
    pass();
    return;
  }

  const config = readConfig();
  for (const allow of config.allow) {
    if (allow.test(filePath)) {
      pass();
      return;
    }
  }

  let why = classify(filePath);
  if (!why) {
    for (const extra of config.extra) {
      if (extra.test(filePath)) {
        why = 'matched custom secret pattern';
        break;
      }
    }
  }

  if (why) {
    deny(
      `Blocked reading "${filePath}" — looks like ${why}. Reading it would leak secrets into the transcript. Ask the user for the value, or read a redacted/example copy instead.`,
      filePath
    );
    return;
  }

  pass();
}

main().catch(() => {
  logScript('ERROR', 'script failure, failing open');
  process.stdout.write('{}\n');
});
