#!/usr/bin/env node
// @argus-meta
// title: Stray doc-file guard
// author: ruydt
// events: PreToolUse
// agents: claudecode, codex
// command: node ~/.argus/hooks/doc-file-guard.js
// matcher: Write
// purpose: Warn (or block) when the agent creates non-standard .md/.txt files outside an allowlist, to stop scratch-doc litter.
// os: linux, macos, windows
// @end

// PreToolUse hook (matcher: Write): agents love to spawn SUMMARY.md / NOTES.txt /
// IMPLEMENTATION_PLAN.md scratch files. This flags new .md/.txt/.markdown writes whose
// name is not on the allowlist (README, CLAUDE, CONTRIBUTING, CHANGELOG, LICENSE,
// SECURITY, SKILL, AGENTS, ...) and is not under an allowed dir (docs/, skills/,
// .claude/, .agents/, .github/). Ported from the ECC "Doc file warning" hook.
//
// Default mode is "warn": a note on stderr, the write still proceeds (exit 0). NOTE:
// for Claude Code a PreToolUse stderr-warn is surfaced to the user/transcript and the
// argus simulator, but is not fed back to the model. Set mode "block" to deny instead.
// Only fires on brand-new files (Write to a path that doesn't exist yet). Fail-open.
//
// Config (optional): ~/.argus/doc-file-guard.json
//   { "mode": "warn", "allow_names": ["TODO"], "allow_dirs": ["notes"], "ext": [".md",".txt",".markdown"] }

const fs = require('fs');
const os = require('os');
const path = require('path');

const CONFIG_FILE = path.join(os.homedir(), '.argus', 'doc-file-guard.json');
const scriptLog = path.join(os.homedir(), '.argus', 'hook-scripts.log');
const logAgent = process.env.CLAUDECODE === '1' ? 'claudecode' : 'codex';
let logSession = '-';
const isClaudeCode = process.env.CLAUDECODE === '1';

// Allowed basenames (without extension), case-insensitive.
const ALLOW_NAMES = new Set([
  'readme', 'claude', 'agents', 'gemini', 'contributing', 'changelog', 'license',
  'licence', 'code_of_conduct', 'security', 'skill', 'notice', 'authors', 'copying',
  'maintainers', 'codeowners', 'support', 'funding',
]);
const ALLOW_DIRS = ['docs', 'doc', 'skills', '.claude', '.agents', '.github', 'documentation'];
const DOC_EXT = new Set(['.md', '.txt', '.markdown', '.mdx', '.rst']);

function logScript(level, msg) {
  try {
    fs.appendFileSync(scriptLog, `${new Date().toISOString()} ${logAgent} ${logSession} doc-file-guard.js ${level} ${msg}\n`);
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
    return {
      mode: parsed.mode === 'block' ? 'block' : 'warn',
      allow_names: Array.isArray(parsed.allow_names) ? parsed.allow_names.map(s => String(s).toLowerCase()) : [],
      allow_dirs: Array.isArray(parsed.allow_dirs) ? parsed.allow_dirs.map(s => String(s).toLowerCase()) : [],
      ext: Array.isArray(parsed.ext) && parsed.ext.length ? parsed.ext.map(s => String(s).toLowerCase()) : null,
    };
  } catch (_) {
    return { mode: 'warn', allow_names: [], allow_dirs: [], ext: null };
  }
}

function pass() {
  process.stdout.write('{}\n');
}

function deny(reason) {
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

// warn = surface a note but let the write through.
function warn(message) {
  process.stderr.write(message + '\n');
  pass();
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
  const docExt = config.ext ? new Set(config.ext) : DOC_EXT;

  const p = filePath.replace(/\\/g, '/');
  const base = p.slice(p.lastIndexOf('/') + 1);
  const lower = base.toLowerCase();
  const dot = lower.lastIndexOf('.');
  const ext = dot > 0 ? lower.slice(dot) : '';
  if (!docExt.has(ext)) {
    pass();
    return;
  }

  // Only flag NEW files — editing an existing doc is fine.
  if (fs.existsSync(filePath)) {
    pass();
    return;
  }

  const stem = dot > 0 ? lower.slice(0, dot) : lower;
  if (ALLOW_NAMES.has(stem) || config.allow_names.includes(stem)) {
    pass();
    return;
  }

  const segments = p.toLowerCase().split('/');
  const allowDirs = ALLOW_DIRS.concat(config.allow_dirs);
  if (segments.some(seg => allowDirs.includes(seg))) {
    pass();
    return;
  }

  const reason =
    `New doc file "${base}" is outside the allowlist (README/CLAUDE/CONTRIBUTING/… or under docs/, skills/, .github/). ` +
    `If this is a scratch/summary note, prefer not creating a repo file — keep it in the conversation, or write it under docs/.`;
  logScript('WARN', `${config.mode}: ${base}`);

  if (config.mode === 'block') {
    deny(reason + ' (blocked by doc-file-guard; set mode:"warn" in ~/.argus/doc-file-guard.json to allow)');
    return;
  }
  warn('[doc-file-guard] ' + reason);
}

main().catch(() => {
  logScript('ERROR', 'script failure, failing open');
  process.stdout.write('{}\n');
});
