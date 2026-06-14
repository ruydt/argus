#!/usr/bin/env node
// @argus-meta
// title: Permission request dialog
// event: PermissionRequest
// runtime: node
// purpose: Native macOS approval dialog with an Always list.
// @end

// PermissionRequest hook: native macOS dialog for Claude Code and Codex.
// Always list: ~/.argus/approved-always.json

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, spawn } = require('child_process');

const ALLOW_OUTPUT = '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}';
const EMPTY_OUTPUT = '{}';
const DENY_OUTPUT = JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'deny', message: 'Denied by user.' } } });
const ALWAYS_FILE = path.join(os.homedir(), '.argus', 'approved-always.json');
const ARGUS_URL = 'http://127.0.0.1:10804/api/hook';
const scriptLog = path.join(os.homedir(), '.argus', 'hook-scripts.log');

function logScript(level, msg) {
  try {
    fs.appendFileSync(scriptLog, `${new Date().toISOString()} permission-request.js ${level} ${msg}\n`);
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

function value(input, key) {
  const v = input[key];
  return typeof v === 'string' ? v : '';
}

function getDetail(tool, input) {
  const tl = tool.toLowerCase();

  if (tl === 'bash' || tl === 'shell') return value(input, 'command');
  if (tl === 'read' || tl === 'write') return value(input, 'file_path');
  if (tl === 'edit') {
    const fp = value(input, 'file_path');
    const oldString = value(input, 'old_string').slice(0, 80).replace(/\n/g, ' ');
    return fp + (oldString ? '\n' + oldString : '');
  }
  if (tl === 'multiedit') {
    const edits = Array.isArray(input.edits) ? input.edits : [];
    const files = [];
    for (const edit of edits) {
      if (!edit || typeof edit !== 'object' || typeof edit.file_path !== 'string' || !edit.file_path) continue;
      if (!files.includes(edit.file_path)) files.push(edit.file_path);
    }
    return files.slice(0, 3).join(', ');
  }
  if (tl === 'glob') return value(input, 'pattern');
  if (tl === 'grep') {
    const pattern = value(input, 'pattern');
    const source = value(input, 'path') || value(input, 'source');
    return pattern + (source ? ' in ' + source : '');
  }
  if (tl === 'ls') return value(input, 'path') || '.';
  if (tl === 'webfetch') return value(input, 'url');
  if (tl === 'websearch') return value(input, 'query');
  if (tl === 'notebookedit') {
    const fp = value(input, 'file_path') || value(input, 'notebook_path');
    const action = value(input, 'action');
    return fp + (action ? ` [${action}]` : '');
  }
  if (tl === 'task' || tl === 'agent') return value(input, 'title') || value(input, 'name');
  if (tl === 'askuserquestion') {
    const questions = Array.isArray(input.questions) ? input.questions : [];
    if (!questions.length) return '';
    const first = questions[0];
    if (first && typeof first === 'object') return value(first, 'question');
    return String(first);
  }
  if (tl === 'apply_patch') {
    const patch = value(input, 'patch') || value(input, 'command');
    for (const line of patch.split(/\r?\n/)) {
      if (line.startsWith('+++ ') || line.startsWith('--- ')) {
        return line.slice(4).split('\t')[0].replace(/^b\//, '');
      }
    }
    return patch.slice(0, 100);
  }

  return (
    value(input, 'command') ||
    value(input, 'url') ||
    value(input, 'path') ||
    value(input, 'file_path') ||
    value(input, 'query') ||
    value(input, 'pattern') ||
    value(input, 'notebook_path')
  );
}

function getAgent(transcriptPath) {
  if (transcriptPath.includes('/.claude/')) return 'Claude Code';
  if (transcriptPath.includes('/.codex/')) return 'Codex';
  return 'AI Agent';
}

function readAlwaysList() {
  try {
    const parsed = JSON.parse(fs.readFileSync(ALWAYS_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function saveAlways(key) {
  if (!key) return;
  const alwaysList = readAlwaysList();
  if (alwaysList.some(entry => entry && entry.key === key)) return;

  const index = key.indexOf(':');
  const tool = index === -1 ? key : key.slice(0, index);
  const detail = index === -1 ? '' : key.slice(index + 1);
  alwaysList.push({ key, tool, detail });

  fs.mkdirSync(path.dirname(ALWAYS_FILE), { recursive: true });
  fs.writeFileSync(ALWAYS_FILE, JSON.stringify(alwaysList, null, 2) + '\n');
}

function logToArgus(payload) {
  const child = spawn('curl', [
    '-s',
    '--max-time',
    '2',
    '-X',
    'POST',
    ARGUS_URL,
    '-H',
    'Content-Type: application/json',
    '-d',
    '@-',
  ], {
    detached: true,
    stdio: ['pipe', 'ignore', 'ignore'],
  });

  child.stdin.end(payload);
  child.unref();
}

function runDetached(command, args) {
  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  } catch (_) {
    // Notification helper only. Never block hook output on app activation.
  }
}

function runJxaDialog({ title, msg, buttons, defaultButton, fallbackButton }) {
  const script = `
(() => {
const app = Application.currentApplication();
app.includeStandardAdditions = true;

try {
  const result = app.displayDialog(${JSON.stringify(msg)}, {
    withTitle: ${JSON.stringify(title)},
    buttons: ${JSON.stringify(buttons)},
    defaultButton: ${JSON.stringify(defaultButton)},
    givingUpAfter: 60
  });

  const suffix = result.gaveUp ? ", gave up:true" : "";
  return "button returned:" + result.buttonReturned + suffix;
} catch (_) {
  return "button returned:" + ${JSON.stringify(fallbackButton)};
}
})()
`;

  return new Promise(resolve => {
    execFile('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script], { timeout: 65000 }, (err, stdout) => {
      if (err) {
        resolve('');
        return;
      }
      resolve(stdout || '');
    });
  });
}

function showDialog(title, msg) {
  return runJxaDialog({
    title,
    msg,
    buttons: ['Deny', 'Always', 'Approve'],
    defaultButton: 'Approve',
    fallbackButton: 'Deny',
  });
}

function questionSummary(input) {
  const questions = Array.isArray(input.questions) ? input.questions : [];
  const first = questions[0];
  if (!first || typeof first !== 'object') return 'Claude is asking for input.';

  const parts = [];
  const header = value(first, 'header');
  const question = value(first, 'question');
  if (header) parts.push(header);
  if (question) parts.push(question);

  const options = Array.isArray(first.options) ? first.options : [];
  for (const option of options.slice(0, 3)) {
    if (!option || typeof option !== 'object') continue;
    const label = value(option, 'label');
    if (label) parts.push('- ' + label);
  }

  return ellipsis(parts.join('\n\n') || 'Claude is asking for input.', 700);
}

function showQuestionDialog(title, msg) {
  return runJxaDialog({
    title,
    msg,
    buttons: ['OK', 'Open Warp'],
    defaultButton: 'Open Warp',
    fallbackButton: 'OK',
  });
}

function openPreferredTerminal() {
  runDetached('/usr/bin/open', ['-a', 'Warp']);
}

async function main() {
  const payload = await readStdin();
  const data = parsePayload(payload);
  const tool = typeof data.tool_name === 'string' && data.tool_name ? data.tool_name : 'Unknown';
  const input = data.tool_input && typeof data.tool_input === 'object' && !Array.isArray(data.tool_input)
    ? data.tool_input
    : {};
  const transcript = typeof data.transcript_path === 'string' ? data.transcript_path : '';
  const agent = getAgent(transcript);

  logScript('INFO', 'start');

  if (tool.toLowerCase() === 'askuserquestion') {
    const result = await showQuestionDialog(`User Question - ${agent}`, questionSummary(input));
    logScript('INFO', 'askuserquestion');
    if (result.includes('button returned:Open Warp')) {
      openPreferredTerminal();
    }
    logScript('INFO', 'allow-or-dismiss');
    logToArgus(payload);
    process.stdout.write(EMPTY_OUTPUT + '\n');
    return;
  }

  const detail = ellipsis(getDetail(tool, input), 200);
  const alwaysKey = `${tool}:${detail}`;

  if (readAlwaysList().some(entry => entry && entry.key === alwaysKey)) {
    logToArgus(payload);
    process.stdout.write(ALLOW_OUTPUT + '\n');
    return;
  }

  const parts = [tool];
  if (detail) parts.push(detail);

  const desc = ellipsis(value(input, 'description').trim(), 120);
  if (desc) parts.push(`(${desc})`);

  const msg = parts.join('\n\n');
  const title = `Permission Request - ${agent}`;
  const result = await showDialog(title, msg);
  logToArgus(payload);

  if (result.includes('button returned:Always')) {
    logScript('INFO', 'always');
    saveAlways(alwaysKey);
    process.stdout.write(ALLOW_OUTPUT + '\n');
  } else if (result.includes('button returned:Approve')) {
    logScript('INFO', 'approve');
    process.stdout.write(ALLOW_OUTPUT + '\n');
  } else if (result.includes('button returned:Deny')) {
    logScript('INFO', 'deny');
    process.stdout.write(DENY_OUTPUT + '\n');
  } else {
    logScript('WARN', 'no selection');
    process.stdout.write(EMPTY_OUTPUT + '\n');
  }
}

main().catch(() => {
  logScript('ERROR', 'activation failed');
  process.stdout.write(EMPTY_OUTPUT + '\n');
});
