#!/usr/bin/env node
// @argus-meta
// title: Protect generated & vendored paths
// author: ruydt
// events: PreToolUse
// agents: claudecode, codex
// command: node ~/.argus/hooks/protect-paths.js
// matcher: Edit|Write|MultiEdit
// purpose: Deny edits to generated/vendored paths (node_modules, dist, build, .git, lockfiles, *.min.*) that get overwritten or shouldn't be hand-edited.
// os: linux, macos, windows
// @end

// PreToolUse hook (matcher: Edit|Write|MultiEdit): blocks edits to files that are
// generated, vendored, or machine-owned — node_modules, dist/build/out/.next, vendor,
// .git internals, lockfiles, and minified bundles. Editing these is almost always a
// mistake: the change is lost on the next install/build, or corrupts repo state.
// Fail-open: any script error exits 0.
//
// Config (optional): ~/.argus/protect-paths.json
//   { "extra": ["<regex on path>"], "allow": ["<regex on path>"], "block_lockfiles": true }

const fs = require('fs');
const os = require('os');
const path = require('path');

const CONFIG_FILE = path.join(os.homedir(), '.argus', 'protect-paths.json');
const scriptLog = path.join(os.homedir(), '.argus', 'hook-scripts.log');
const logAgent = process.env.CLAUDECODE === '1' ? 'claudecode' : 'codex';
let logSession = '-';
const isClaudeCode = process.env.CLAUDECODE === '1';

// Directory segments that are never hand-edited (matched as /seg/ anywhere in the path).
const BLOCKED_DIRS = [
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', '.svelte-kit',
  'vendor', '.venv', 'venv', '__pycache__', '.mypy_cache', '.pytest_cache',
  'target', '.gradle', '.terraform', 'coverage', '.cache',
];
const LOCKFILES = new Set([
  'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'cargo.lock',
  'poetry.lock', 'composer.lock', 'gemfile.lock', 'go.sum', 'pdm.lock', 'uv.lock',
]);

function logScript(level, msg) {
  try {
    fs.appendFileSync(scriptLog, `${new Date().toISOString()} ${logAgent} ${logSession} protect-paths.js ${level} ${msg}\n`);
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
    return {
      extra: toRegexList(parsed.extra),
      allow: toRegexList(parsed.allow),
      block_lockfiles: parsed.block_lockfiles !== false,
    };
  } catch (_) {
    return { extra: [], allow: [], block_lockfiles: true };
  }
}

function classify(filePath, blockLockfiles) {
  const p = filePath.replace(/\\/g, '/');
  const padded = `/${p}/`;
  for (const dir of BLOCKED_DIRS) {
    if (padded.includes(`/${dir}/`)) return `the generated/vendored "${dir}" directory`;
  }
  const base = p.slice(p.lastIndexOf('/') + 1).toLowerCase();
  if (blockLockfiles && LOCKFILES.has(base)) {
    return 'a dependency lockfile (regenerate it with your package manager, do not hand-edit)';
  }
  if (/\.min\.(js|css|mjs|cjs)$/.test(base)) return 'a minified build artifact';
  if (/\.(map)$/.test(base)) return 'a source-map artifact';
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

  let why = classify(filePath, config.block_lockfiles);
  if (!why) {
    for (const extra of config.extra) {
      if (extra.test(filePath)) {
        why = 'a custom protected path';
        break;
      }
    }
  }

  if (why) {
    deny(
      `Blocked editing "${filePath}" — it is ${why}. Edit the source it is generated from instead. To override, add a regex to the "allow" list in ~/.argus/protect-paths.json.`,
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
