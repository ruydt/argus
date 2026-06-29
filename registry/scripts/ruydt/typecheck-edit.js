#!/usr/bin/env node
// @argus-meta
// title: Type-check on edit
// author: ruydt
// events: PostToolUse
// agents: claudecode, codex
// command: node ~/.argus/hooks/typecheck-edit.js
// matcher: Edit|Write|MultiEdit
// purpose: After editing a TS/Go file, run tsc --noEmit / go build and feed type errors back so the agent fixes them.
// os: linux, macos
// @end
// OS: macOS / Linux. Resolves node_modules/.bin/tsc (POSIX launcher) and `go` on PATH.

// PostToolUse hook (matcher: Edit|Write|MultiEdit): type-checks after an edit and feeds
// errors back so the agent self-corrects. Ported from the ECC "TypeScript check" hook,
// extended to Go. This is the type-checker registry `format-lint` deliberately omits
// (that one runs eslint/ruff/gofmt — formatters, not `tsc`/`go build`).
//   .ts .tsx .mts .cts  -> tsc --noEmit   (nearest tsconfig, local install only)
//   .go                 -> go build ./... (nearest go.mod)
// Project-wide by nature: tsc reports across the project, so errors in OTHER files can
// surface too — that's intended (the edit may have broken a consumer). Missing tools are
// skipped silently. Fail-open: any script error exits 0.
//
// Config (optional): ~/.argus/typecheck-edit.json
//   { "ts": true, "go": true, "timeout_ms": 15000, "max_chars": 2500 }

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, execSync } = require('child_process');

const CONFIG_FILE = path.join(os.homedir(), '.argus', 'typecheck-edit.json');
const scriptLog = path.join(os.homedir(), '.argus', 'hook-scripts.log');
const logAgent = process.env.CLAUDECODE === '1' ? 'claudecode' : 'codex';
let logSession = '-';
const isClaudeCode = process.env.CLAUDECODE === '1';

const TS_EXT = new Set(['.ts', '.tsx', '.mts', '.cts']);

function logScript(level, msg) {
  try {
    fs.appendFileSync(scriptLog, `${new Date().toISOString()} ${logAgent} ${logSession} typecheck-edit.js ${level} ${msg}\n`);
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
      ts: parsed.ts !== false,
      go: parsed.go !== false,
      timeout_ms:
        Number.isFinite(parsed.timeout_ms) && parsed.timeout_ms > 0 ? parsed.timeout_ms : 15000,
      max_chars:
        Number.isFinite(parsed.max_chars) && parsed.max_chars > 0 ? parsed.max_chars : 2500,
    };
  } catch (_) {
    return { ts: true, go: true, timeout_ms: 15000, max_chars: 2500 };
  }
}

function ellipsis(text, max) {
  if (text.length <= max) return text;
  return text.slice(0, max) + '\n...(truncated)';
}

// Walk up from startDir looking for a marker file; return its directory or null.
function findUp(startDir, marker) {
  let dir = startDir;
  for (let i = 0; i < 15; i++) {
    if (fs.existsSync(path.join(dir, marker))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function findLocalBin(startDir, name) {
  let dir = startDir;
  for (let i = 0; i < 15; i++) {
    const bin = path.join(dir, 'node_modules', '.bin', name);
    if (fs.existsSync(bin)) return bin;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function onPath(name) {
  try {
    execSync(`command -v ${name}`, { stdio: ['ignore', 'ignore', 'ignore'], timeout: 2000 });
    return true;
  } catch (_) {
    return false;
  }
}

function pass() {
  process.stdout.write('{}\n');
}

function feedback(text) {
  logScript('WARN', `type errors fed back: ${text.replace(/\s+/g, ' ').slice(0, 160)}`);
  if (isClaudeCode) {
    process.stdout.write(JSON.stringify({ decision: 'block', reason: text }) + '\n');
    return;
  }
  process.stderr.write(text + '\n');
}

async function main() {
  const payload = parsePayload(await readStdin());
  const input =
    payload.tool_input && typeof payload.tool_input === 'object' ? payload.tool_input : {};
  const filePath = typeof input.file_path === 'string' ? input.file_path : '';
  if (!filePath || !fs.existsSync(filePath)) {
    pass();
    return;
  }

  const config = readConfig();
  const ext = path.extname(filePath).toLowerCase();
  const fileDir = path.dirname(filePath);

  if (TS_EXT.has(ext) && config.ts) {
    const tsconfigDir = findUp(fileDir, 'tsconfig.json');
    const tsc = findLocalBin(fileDir, 'tsc');
    if (tsconfigDir && tsc) {
      try {
        execFileSync(tsc, ['--noEmit'], {
          cwd: tsconfigDir,
          encoding: 'utf8',
          timeout: config.timeout_ms,
          stdio: ['ignore', 'pipe', 'pipe'],
          maxBuffer: 8 * 1024 * 1024,
        });
        logScript('INFO', `tsc clean for ${filePath}`);
      } catch (err) {
        const out = `${err.stdout || ''}${err.stderr || ''}`.trim();
        // tsc exits non-zero on type errors; only feed back when it actually printed errors.
        if (out && /error TS\d+/.test(out)) {
          feedback(
            `tsc --noEmit reports type errors after editing ${path.basename(filePath)}:\n${ellipsis(out, config.max_chars)}`
          );
          return;
        }
        logScript('INFO', `tsc non-error exit for ${filePath}`);
      }
    }
  }

  if (ext === '.go' && config.go) {
    const modDir = findUp(fileDir, 'go.mod');
    if (modDir && onPath('go')) {
      try {
        execFileSync('go', ['build', './...'], {
          cwd: modDir,
          encoding: 'utf8',
          timeout: config.timeout_ms,
          stdio: ['ignore', 'pipe', 'pipe'],
          maxBuffer: 8 * 1024 * 1024,
        });
        logScript('INFO', `go build clean for ${filePath}`);
      } catch (err) {
        const out = `${err.stdout || ''}${err.stderr || ''}`.trim();
        if (out) {
          feedback(
            `go build ./... fails after editing ${path.basename(filePath)}:\n${ellipsis(out, config.max_chars)}`
          );
          return;
        }
      }
    }
  }

  pass();
}

main().catch(() => {
  logScript('ERROR', 'script failure, failing open');
  process.stdout.write('{}\n');
});
