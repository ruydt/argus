#!/usr/bin/env node
// PostToolUse hook (matcher: Edit|Write|MultiEdit): auto-formats the edited file and
// feeds lint errors back to the agent so it self-corrects. Scoped to the single touched
// file (tool_input.file_path) — never the whole repo — to keep the loop fast. Missing
// tools are skipped silently (graceful degradation). Fail-open: any script error exits 0.
//
// Formatters/linters by extension (probed before use, never installed):
//   .js .jsx .ts .tsx .css .scss .json .md .yaml .yml .html -> prettier --write (local install)
//   .js .jsx .ts .tsx                                       -> eslint (local install, check only)
//   .py                                                     -> ruff format + ruff check
//   .go                                                     -> gofmt -w
//
// Feedback channel (research note): PostToolUse cannot undo an edit. Lint errors are
// returned as {"decision":"block","reason":"..."} so Claude Code reads them and fixes
// the file on the next turn. Codex gets the same text on stderr.
// Config (optional): ~/.argus/format-lint.json
//   { "disable": ["lint"], "skip_ext": [".md"], "timeout_ms": 8000 }

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

const CONFIG_FILE = path.join(os.homedir(), '.argus', 'format-lint.json');
const scriptLog = path.join(os.homedir(), '.argus', 'hook-scripts.log');
const isClaudeCode = process.env.CLAUDECODE === '1';

const PRETTIER_EXT = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.css', '.scss', '.json', '.md', '.yaml', '.yml', '.html',
]);
const ESLINT_EXT = new Set(['.js', '.jsx', '.ts', '.tsx']);

function logScript(level, msg) {
  try {
    fs.appendFileSync(scriptLog, `${new Date().toISOString()} format-lint.js ${level} ${msg}\n`);
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

function readConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return {
      disable: Array.isArray(parsed.disable) ? parsed.disable : [],
      skip_ext: Array.isArray(parsed.skip_ext) ? parsed.skip_ext : [],
      timeout_ms:
        Number.isFinite(parsed.timeout_ms) && parsed.timeout_ms > 0 ? parsed.timeout_ms : 8000,
    };
  } catch (_) {
    return { disable: [], skip_ext: [], timeout_ms: 8000 };
  }
}

function ellipsis(text, max) {
  if (text.length <= max) return text;
  return text.slice(0, max) + '...';
}

// Locate a node_modules/.bin executable by walking up from the file's directory.
// Avoids npx (slow, may hit the network) and global installs (version surprises).
function findLocalBin(startDir, name) {
  let dir = startDir;
  for (let i = 0; i < 12; i++) {
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

function run(cmd, args, opts) {
  return execFileSync(cmd, args, {
    encoding: 'utf8',
    timeout: opts.timeout_ms,
    cwd: opts.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function pass() {
  process.stdout.write('{}\n');
}

function feedback(text) {
  logScript('WARN', `lint feedback: ${ellipsis(text.replace(/\s+/g, ' '), 200)}`);
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
  if (config.skip_ext.includes(ext)) {
    pass();
    return;
  }

  const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : path.dirname(filePath);
  const opts = { cwd, timeout_ms: config.timeout_ms };
  const lintErrors = [];

  if (PRETTIER_EXT.has(ext)) {
    const prettier = findLocalBin(path.dirname(filePath), 'prettier');
    if (prettier) {
      try {
        run(prettier, ['--write', filePath], opts);
        logScript('INFO', `prettier formatted ${filePath}`);
      } catch (_) {
        logScript('WARN', `prettier failed on ${filePath}`);
      }
    }
  }

  if (ESLINT_EXT.has(ext) && !config.disable.includes('lint')) {
    const eslint = findLocalBin(path.dirname(filePath), 'eslint');
    if (eslint) {
      try {
        run(eslint, [filePath], opts);
      } catch (err) {
        const out = `${err.stdout || ''}${err.stderr || ''}`.trim();
        // exit 1 = lint problems found; anything else (config error, crash) stays silent
        if (err.status === 1 && out) lintErrors.push(out);
      }
    }
  }

  if (ext === '.py' && onPath('ruff')) {
    try {
      run('ruff', ['format', filePath], opts);
    } catch (_) {}
    if (!config.disable.includes('lint')) {
      try {
        run('ruff', ['check', filePath], opts);
      } catch (err) {
        const out = `${err.stdout || ''}${err.stderr || ''}`.trim();
        if (err.status === 1 && out) lintErrors.push(out);
      }
    }
  }

  if (ext === '.go' && onPath('gofmt')) {
    try {
      run('gofmt', ['-w', filePath], opts);
      logScript('INFO', `gofmt formatted ${filePath}`);
    } catch (_) {}
  }

  if (lintErrors.length > 0) {
    feedback(
      `Lint errors in ${filePath} after your edit — fix them:\n${ellipsis(lintErrors.join('\n'), 2500)}`
    );
    return;
  }

  pass();
}

main().catch(() => {
  logScript('ERROR', 'script failure, failing open');
  process.stdout.write('{}\n');
});
