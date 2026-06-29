#!/usr/bin/env node
// @argus-meta
// title: Test gate on stop
// author: ruydt
// events: Stop
// agents: claudecode, codex
// command: node ~/.argus/hooks/test-gate.js
// purpose: On Stop, if git shows source changes, remind (or run) the project's test command so work doesn't end untested.
// os: linux, macos
// @end
// OS: macOS / Linux. Detects the package manager from lockfiles and shells out via the
// project's test script; "run" mode uses /bin/sh.

// Stop hook: when the session ends with uncommitted source changes, this nudges you to run
// the test suite. Three modes (config "mode"):
//   "remind" (default) — log + print which test command to run. Never blocks.
//   "run"              — actually run the detected test command and report pass/fail.
//   "block"            — Claude Code only: return decision:block so the agent must address
//                        it. Loop-guarded via stop_hook_active so it fires at most once.
// Test command resolution: config.command > package.json scripts.test (npm/pnpm/yarn/bun by
// lockfile) > `make test` if a Makefile "test:" target exists > else nothing to do.
// Fail-open: any error exits 0 (never strands the agent).
//
// Config (optional): ~/.argus/test-gate.json
//   { "mode": "remind", "command": "", "timeout_ms": 60000, "source_ext": [".ts",".go",".py"] }

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const CONFIG_FILE = path.join(os.homedir(), '.argus', 'test-gate.json');
const scriptLog = path.join(os.homedir(), '.argus', 'hook-scripts.log');
const logAgent = process.env.CLAUDECODE === '1' ? 'claudecode' : 'codex';
let logSession = '-';
const isClaudeCode = process.env.CLAUDECODE === '1';

const DEFAULT_SOURCE_EXT = [
  '.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.go', '.py', '.rs', '.rb', '.java', '.kt',
  '.c', '.cc', '.cpp', '.h', '.hpp', '.cs', '.php', '.swift',
];

function logScript(level, msg) {
  try {
    fs.appendFileSync(scriptLog, `${new Date().toISOString()} ${logAgent} ${logSession} test-gate.js ${level} ${msg}\n`);
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
    const mode = ['remind', 'run', 'block'].includes(parsed.mode) ? parsed.mode : 'remind';
    return {
      mode,
      command: typeof parsed.command === 'string' ? parsed.command.trim() : '',
      timeout_ms:
        Number.isFinite(parsed.timeout_ms) && parsed.timeout_ms > 0 ? parsed.timeout_ms : 60000,
      source_ext: Array.isArray(parsed.source_ext) && parsed.source_ext.length
        ? parsed.source_ext.map(s => String(s).toLowerCase())
        : DEFAULT_SOURCE_EXT,
    };
  } catch (_) {
    return { mode: 'remind', command: '', timeout_ms: 60000, source_ext: DEFAULT_SOURCE_EXT };
  }
}

function changedSourceFiles(cwd, sourceExt) {
  try {
    const out = execFileSync('git', ['status', '--porcelain'], {
      cwd,
      encoding: 'utf8',
      timeout: 1500,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out
      .split('\n')
      .map(l => l.slice(3).trim())
      .filter(Boolean)
      .filter(f => sourceExt.includes(path.extname(f).toLowerCase()));
  } catch (_) {
    return [];
  }
}

function detectPackageManager(cwd) {
  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(cwd, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(cwd, 'bun.lockb'))) return 'bun';
  return 'npm';
}

function detectTestCommand(cwd, config) {
  if (config.command) return config.command;
  try {
    const pkgPath = path.join(cwd, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg && pkg.scripts && typeof pkg.scripts.test === 'string') {
        const pm = detectPackageManager(cwd);
        return pm === 'npm' ? 'npm test' : `${pm} test`;
      }
    }
  } catch (_) {}
  try {
    const makefile = path.join(cwd, 'Makefile');
    if (fs.existsSync(makefile) && /^test:/m.test(fs.readFileSync(makefile, 'utf8'))) {
      return 'make test';
    }
  } catch (_) {}
  return '';
}

function pass() {
  process.stdout.write('{}\n');
}

function block(reason) {
  if (isClaudeCode) {
    process.stdout.write(JSON.stringify({ decision: 'block', reason }) + '\n');
    return;
  }
  process.stderr.write(reason + '\n');
}

async function main() {
  const payload = parsePayload(await readStdin());
  const config = readConfig();
  const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();

  const changed = changedSourceFiles(cwd, config.source_ext);
  if (changed.length === 0) {
    pass();
    return;
  }

  const command = detectTestCommand(cwd, config);
  if (!command) {
    logScript('INFO', `${changed.length} source change(s) but no test command detected`);
    pass();
    return;
  }

  const summary = `${changed.length} changed source file(s); test command: \`${command}\``;

  if (config.mode === 'run') {
    logScript('INFO', `running ${command}`);
    const res = spawnSync('/bin/sh', ['-c', command], {
      cwd,
      encoding: 'utf8',
      timeout: config.timeout_ms,
    });
    if (res.status === 0) {
      logScript('INFO', 'tests passed');
      process.stderr.write(`[test-gate] tests passed (${command}).\n`);
      pass();
      return;
    }
    const out = `${res.stdout || ''}${res.stderr || ''}`.trim().slice(-2000);
    logScript('WARN', `tests failed (status ${res.status})`);
    block(`Tests fail after your changes (\`${command}\`):\n${out}\nFix them before finishing.`);
    return;
  }

  if (config.mode === 'block') {
    // Avoid an infinite Stop loop: only block on the first stop of a chain.
    if (payload.stop_hook_active) {
      pass();
      return;
    }
    logScript('INFO', `blocking: ${summary}`);
    block(`You changed source but haven't run tests. Run \`${command}\` and confirm it passes before stopping.`);
    return;
  }

  // remind (default)
  logScript('INFO', `reminder: ${summary}`);
  process.stderr.write(`[test-gate] ${summary} — consider running it before you wrap up.\n`);
  pass();
}

main().catch(() => {
  logScript('ERROR', 'script failure, failing open');
  process.stdout.write('{}\n');
});
