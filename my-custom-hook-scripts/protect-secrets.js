#!/usr/bin/env node
// PreToolUse hook (matcher: Read|Edit|Write|Bash): blocks access to secret files
// for Claude Code and Codex. For file tools it checks tool_input.file_path; for Bash
// it tokenizes the command and checks each token. Fail-open on any script error.
// Config (optional): ~/.argus/protected-paths.json { "extra": ["<regex>"], "allow": ["<regex>"] }

const fs = require('fs');
const os = require('os');
const path = require('path');

const CONFIG_FILE = path.join(os.homedir(), '.argus', 'protected-paths.json');
const scriptLog = path.join(os.homedir(), '.argus', 'hook-scripts.log');
const isClaudeCode = process.env.CLAUDECODE === '1';

// Checked before PROTECTED — first match wins.
const DEFAULT_ALLOW = [
  /\.env\.(example|sample|template)$/,
  /\bsecrets\.(test|spec)\.[a-z]+$/,
];

const PROTECTED = [
  { re: /(^|\/)\.env(\.[^/]*)?$/, why: '.env file' },
  { re: /\.pem$/, why: 'PEM certificate/key' },
  // Intentionally broad: also blocks non-secret *.key files (e.g. license.key) — allowlist via config if needed.
  { re: /\.key$/, why: 'private key file' },
  { re: /(^|\/)id_rsa[^/]*$/, why: 'SSH RSA key' },
  { re: /(^|\/)id_ed25519[^/]*$/, why: 'SSH Ed25519 key' },
  { re: /(^|\/)\.ssh(\/|$)/, why: '~/.ssh directory' },
  { re: /(^|\/)\.aws(\/|$)/, why: '~/.aws directory' },
  { re: /(^|\/)\.config\/gh(\/|$)/, why: 'GitHub CLI config' },
  { re: /(^|\/)\.netrc$/, why: '.netrc credentials' },
  { re: /\.p12$/, why: 'PKCS#12 keystore' },
  { re: /(^|\/)secrets\.[^/]+$/, why: 'secrets file' },
];

function logScript(level, msg) {
  try {
    fs.appendFileSync(scriptLog, `${new Date().toISOString()} protect-secrets.js ${level} ${msg}\n`);
  } catch (_) {}
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
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

function ellipsis(text, max) {
  if (text.length <= max) return text;
  return text.slice(0, max) + '...';
}

function toRegexList(values) {
  const out = [];
  if (!Array.isArray(values)) return out;
  for (const value of values) {
    if (typeof value !== 'string' || !value) continue;
    try {
      out.push(new RegExp(value));
    } catch (_) {
      logScript('WARN', `invalid config regex skipped: ${ellipsis(value, 80)}`);
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

function pass() {
  process.stdout.write('{}\n');
}

function deny(why, target) {
  const reason = `Blocked access to protected file (${why}): ${ellipsis(target, 120)} — this file may contain secrets. Ask the user to handle it manually if access is required.`;
  logScript('WARN', `deny (${why}): ${ellipsis(target, 200)}`);
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

// Returns { why } when the candidate path matches a protected pattern, else null.
function matchProtected(candidate, config) {
  for (const allow of DEFAULT_ALLOW.concat(config.allow)) {
    if (allow.test(candidate)) return null;
  }
  for (const pattern of PROTECTED) {
    if (pattern.re.test(candidate)) return { why: pattern.why };
  }
  for (const extra of config.extra) {
    if (extra.test(candidate)) return { why: 'matched custom pattern' };
  }
  return null;
}

async function main() {
  const data = parsePayload(await readStdin());
  const tool = typeof data.tool_name === 'string' ? data.tool_name.toLowerCase() : '';
  const input =
    data.tool_input && typeof data.tool_input === 'object' && !Array.isArray(data.tool_input)
      ? data.tool_input
      : {};
  const config = readConfig();

  if (tool === 'bash' || tool === 'shell') {
    const command = typeof input.command === 'string' ? input.command : '';
    const tokens = command.split(/[\s;|&<>()'"`]+/).filter(Boolean);
    for (const token of tokens) {
      const hit = matchProtected(token, config);
      if (hit) {
        deny(hit.why, command);
        return;
      }
    }
    pass();
    return;
  }

  const filePath = typeof input.file_path === 'string' ? input.file_path : '';
  if (!filePath) {
    pass();
    return;
  }
  const hit = matchProtected(filePath, config);
  if (hit) {
    deny(hit.why, filePath);
    return;
  }
  pass();
}

main().catch(() => {
  logScript('ERROR', 'script failure, failing open');
  process.stdout.write('{}\n');
});
