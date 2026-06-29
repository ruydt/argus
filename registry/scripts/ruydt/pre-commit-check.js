#!/usr/bin/env node
// @argus-meta
// title: Pre-commit debug-leftover check
// author: ruydt
// events: PreToolUse
// agents: claudecode, codex
// command: node ~/.argus/hooks/pre-commit-check.js
// matcher: Bash
// purpose: Block git commit when STAGED changes add debug leftovers (console.log, debugger, pdb, binding.pry, dbg!).
// os: linux, macos, windows
// @end

// PreToolUse hook (matcher: Bash): when the command is a `git commit`, scans the staged
// diff (git diff --cached -U0) for debug statements added in this commit and blocks with
// a file:line list so the agent strips them first. Only ADDED lines are checked — existing
// debug code elsewhere won't trip it. Ported/adapted from the ECC "Pre-commit quality
// check" hook (commit-message validation is left to registry `commit-msg-lint`).
// Worktree-safe: git runs in the payload cwd. Fail-open: any error exits 0.
//
// Config (optional): ~/.argus/pre-commit-check.json
//   { "block": true, "extra": ["<regex>"], "allow_paths": ["<regex on file path>"], "max_findings": 20 }

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const CONFIG_FILE = path.join(os.homedir(), '.argus', 'pre-commit-check.json');
const scriptLog = path.join(os.homedir(), '.argus', 'hook-scripts.log');
const logAgent = process.env.CLAUDECODE === '1' ? 'claudecode' : 'codex';
let logSession = '-';
const isClaudeCode = process.env.CLAUDECODE === '1';

const DEBUG_PATTERNS = [
  { re: /\bconsole\.(log|debug|dir|trace)\s*\(/, why: 'console.log/debug' },
  { re: /\bdebugger\b\s*;?/, why: 'debugger statement' },
  { re: /\bbreakpoint\s*\(\s*\)/, why: 'breakpoint()' },
  { re: /\bpdb\.set_trace\s*\(/, why: 'pdb.set_trace()' },
  { re: /^\s*import\s+i?pdb\b/, why: 'import pdb' },
  { re: /\bbinding\.pry\b/, why: 'binding.pry' },
  { re: /\bdbg!\s*\(/, why: 'dbg! macro' },
  { re: /\bfmt\.Print(ln|f)?\s*\(\s*"DEBUG/i, why: 'debug print' },
];

function logScript(level, msg) {
  try {
    fs.appendFileSync(scriptLog, `${new Date().toISOString()} ${logAgent} ${logSession} pre-commit-check.js ${level} ${msg}\n`);
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
      block: parsed.block !== false,
      extra: toRegexList(parsed.extra).map(re => ({ re, why: 'custom pattern' })),
      allow_paths: toRegexList(parsed.allow_paths),
      max_findings:
        Number.isFinite(parsed.max_findings) && parsed.max_findings > 0 ? parsed.max_findings : 20,
    };
  } catch (_) {
    return { block: true, extra: [], allow_paths: [], max_findings: 20 };
  }
}

function stagedDiff(cwd) {
  try {
    return execFileSync('git', ['diff', '--cached', '-U0', '--no-color'], {
      cwd,
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch (_) {
    return '';
  }
}

// Walk the unified diff, tracking the current target file, collecting added lines that
// match a debug pattern. Returns [{ file, why, snippet }].
function scanDiff(diff, patterns, allowPaths, max) {
  const findings = [];
  let currentFile = '';
  let skip = false;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      const raw = line.slice(4).trim();
      currentFile = raw === '/dev/null' ? '' : raw.replace(/^b\//, '');
      skip = currentFile ? allowPaths.some(re => re.test(currentFile)) : true;
      continue;
    }
    if (skip || !currentFile) continue;
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    const added = line.slice(1);
    for (const pat of patterns) {
      if (pat.re.test(added)) {
        findings.push({ file: currentFile, why: pat.why, snippet: added.trim().slice(0, 100) });
        break;
      }
    }
    if (findings.length >= max) break;
  }
  return findings;
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

async function main() {
  const payload = parsePayload(await readStdin());
  const input =
    payload.tool_input && typeof payload.tool_input === 'object' ? payload.tool_input : {};
  const command = typeof input.command === 'string' ? input.command : '';
  if (!command || !/\bgit\b[^|&;]*\bcommit\b/.test(command)) {
    pass();
    return;
  }

  const config = readConfig();
  const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();
  const diff = stagedDiff(cwd);
  if (!diff) {
    pass();
    return;
  }

  const patterns = DEBUG_PATTERNS.concat(config.extra);
  const findings = scanDiff(diff, patterns, config.allow_paths, config.max_findings);
  if (findings.length === 0) {
    pass();
    return;
  }

  const list = findings.map(f => `  ${f.file}: ${f.why} → ${f.snippet}`).join('\n');
  logScript('WARN', `${config.block ? 'deny' : 'warn'}: ${findings.length} debug leftover(s)`);
  const reason =
    `Staged changes add ${findings.length} debug leftover(s):\n${list}\n` +
    `Remove them (or unstage those lines) before committing. To allow a path, add it to ` +
    `"allow_paths" in ~/.argus/pre-commit-check.json.`;

  if (config.block) {
    deny(reason);
    return;
  }
  process.stderr.write('[pre-commit-check] ' + reason + '\n');
  pass();
}

main().catch(() => {
  logScript('ERROR', 'script failure, failing open');
  process.stdout.write('{}\n');
});
