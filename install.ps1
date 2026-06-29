# Argus installer for Windows (PowerShell 5+).
#   irm https://raw.githubusercontent.com/ruydt/argus/main/install.ps1 | iex
$ErrorActionPreference = 'Stop'

$Repo        = 'ruydt/argus'
$ArgusDir    = Join-Path $env:USERPROFILE '.argus'
$BinDir      = Join-Path $ArgusDir 'bin'
$Binary      = Join-Path $BinDir 'argus.exe'
$HooksDir    = Join-Path $ArgusDir 'hooks'
$ActivateScript = Join-Path $HooksDir 'argus-activate.js'
$ArgusPort   = 10804

# Node is required: the SessionStart hook is a Node script.
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error 'node was not found on PATH. Install Node.js 18+ and re-run.'
}

# --- 1. arch detection ------------------------------------------------------
$rawArch = $env:PROCESSOR_ARCHITECTURE
switch ($rawArch) {
  'AMD64' { $Arch = 'amd64' }
  'ARM64' { $Arch = 'arm64' }
  default { Write-Error "unsupported architecture: $rawArch" }
}

# --- 2. latest release tag --------------------------------------------------
Write-Host 'Fetching latest argus release...'
$release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers @{ 'User-Agent' = 'argus-installer' }
$Version = $release.tag_name
if (-not $Version) { Write-Error 'could not fetch latest release from GitHub API' }
Write-Host "  version: $Version"

# --- 3. download archive + checksum, verify ---------------------------------
$verNoV  = $Version.TrimStart('v')
$archive = "argus_${verNoV}_windows_${Arch}.zip"
$baseUrl = "https://github.com/$Repo/releases/download/$Version"
$work    = New-Item -ItemType Directory -Path (Join-Path $env:TEMP ("argus-" + [guid]::NewGuid()))
try {
  Write-Host "Downloading $archive..."
  Invoke-WebRequest -Uri "$baseUrl/$archive" -OutFile (Join-Path $work $archive)
  Invoke-WebRequest -Uri "$baseUrl/checksums.txt" -OutFile (Join-Path $work 'checksums.txt')

  Write-Host 'Verifying checksum...'
  $expected = (Select-String -Path (Join-Path $work 'checksums.txt') -Pattern ([regex]::Escape($archive))).Line.Split(' ')[0]
  $actual   = (Get-FileHash -Path (Join-Path $work $archive) -Algorithm SHA256).Hash.ToLower()
  if ($expected -and ($expected.ToLower() -ne $actual)) {
    Write-Error "checksum mismatch for $archive (expected $expected, got $actual)"
  }

  # --- 4. extract + install binary ------------------------------------------
  Write-Host 'Installing argus...'
  New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
  Expand-Archive -Path (Join-Path $work $archive) -DestinationPath $work -Force
  $exe = Join-Path $work 'argus.exe'
  if (-not (Test-Path $exe)) { Write-Error 'argus.exe not found in archive' }
  Copy-Item -Path $exe -Destination $Binary -Force
  Write-Host "  -> $Binary"
}
finally {
  Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}

# --- 5. write argus-activate.js (SessionStart hook; starts the server) -------
New-Item -ItemType Directory -Force -Path $HooksDir | Out-Null
# Forward slashes so the path is a clean JS string literal; Node accepts them on Windows.
$binJs = $Binary -replace '\\', '/'
# Single-quoted here-string keeps the JS verbatim (no PowerShell $ / backtick parsing).
$activateJs = @'
#!/usr/bin/env node
// @argus-meta
// title: Argus session start
// author: argus
// event: SessionStart
// runtime: node
// purpose: Start the Argus server and show a liveness banner at session start.
// @end
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const db = path.join(os.homedir(), '.argus', 'argus.db');
const logPath = path.join(os.homedir(), '.argus', 'argus.log');
const scriptLog = path.join(os.homedir(), '.argus', 'hook-scripts.log');
const url = 'http://127.0.0.1:10804';
const binary = '__ARGUS_BINARY__';
const isClaudeCode = process.env.CLAUDECODE === '1';

function isServerUp() {
  return new Promise(resolve => {
    const sock = net.createConnection({ host: '127.0.0.1', port: 10804 });
    sock.setTimeout(500);
    sock.on('connect', () => { sock.destroy(); resolve(true); });
    sock.on('error', () => resolve(false));
    sock.on('timeout', () => { sock.destroy(); resolve(false); });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function emit(msg) {
  if (isClaudeCode) {
    process.stdout.write(JSON.stringify({ systemMessage: msg }));
  } else {
    process.stdout.write(msg);
  }
}

function logScript(level, msg) {
  try {
    fs.appendFileSync(scriptLog, `${new Date().toISOString()} argus-activate.js ${level} ${msg}\n`);
  } catch (_) {}
}

// Launch the server detached so it outlives this hook process.
function startServer() {
  try { fs.mkdirSync(path.dirname(db), { recursive: true }); } catch (_) {}
  let out;
  try { out = fs.openSync(logPath, 'a'); } catch (_) { out = 'ignore'; }
  const child = spawn(binary, [], {
    detached: true,
    windowsHide: true,
    stdio: ['ignore', out, out],
    env: { ...process.env, DB_PATH: db, ADDR: '127.0.0.1:10804' },
  });
  child.unref();
}

async function main() {
  logScript('INFO', 'start');
  let up = await isServerUp();
  if (!up) {
    logScript('WARN', 'server offline; launching');
    startServer();
    await sleep(1200);
    up = await isServerUp();
  }
  if (!up) {
    logScript('ERROR', 'server offline after start attempt');
    emit(isClaudeCode ? '\x1b[1m\x1b[31mARGUS offline\x1b[0m' : 'ARGUS offline');
    return;
  }
  let msg;
  try {
    const result = execSync(
      `sqlite3 "${db}" "SELECT COUNT(*), COUNT(DISTINCT session_id) FROM hook_events"`,
      { encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim();
    const [events, sessions] = result.split('|');
    msg = `ARGUS live @ ${url} | ${parseInt(events, 10).toLocaleString()} events · ${sessions.trim()} sessions`;
  } catch (_) {
    msg = `ARGUS live @ ${url}`;
  }
  emit(isClaudeCode ? '\x1b[35m' + msg + '\x1b[0m' : msg);
}

main().catch(err => {
  logScript('ERROR', `activation failed: ${err && err.message ? err.message : String(err)}`);
});
'@
$activateJs = $activateJs -replace '__ARGUS_BINARY__', $binJs
Set-Content -Path $ActivateScript -Value $activateJs -Encoding UTF8
Write-Host "  -> $ActivateScript"

# --- 6. (no hook wiring) ----------------------------------------------------
# Argus no longer edits any agent's settings during install. The activate hook
# above is written to ~/.argus/hooks but left unwired — wire it per agent from
# the Hooks page in the dashboard via "Apply preset". Run `argus start` to
# launch the server and open the dashboard.

# --- 7. add bin to user PATH ------------------------------------------------
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($userPath -notlike "*$BinDir*") {
  [Environment]::SetEnvironmentVariable('Path', "$BinDir;$userPath", 'User')
  Write-Host "  -> added $BinDir to your user PATH (restart terminals to pick it up)"
}
# Always make the binary usable in THIS session, even on re-run when the user
# PATH already contains it but the current shell was started before.
if ($env:Path -notlike "*$BinDir*") { $env:Path = "$BinDir;$env:Path" }

Write-Host ''
Write-Host "argus $Version installed. Start it:"
Write-Host '  argus start'
Write-Host '(restart terminals if `argus` is not found)'
