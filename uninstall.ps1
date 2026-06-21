#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$ArgusDir       = Join-Path $env:USERPROFILE '.argus'
$BinDir         = Join-Path $ArgusDir 'bin'
$Binary         = Join-Path $BinDir 'argus.exe'
$Settings       = Join-Path $env:USERPROFILE '.claude\settings.json'
$ArgusPort      = 10804

Write-Host 'Uninstalling argus...'

# --- 1. stop the server -----------------------------------------------------
# Prefer a clean shutdown via the binary; fall back to killing the port owner.
if (Test-Path $Binary) {
  try { & $Binary stop *> $null } catch {}
}
try {
  $conns = Get-NetTCPConnection -LocalPort $ArgusPort -State Listen -ErrorAction SilentlyContinue
  foreach ($c in $conns) {
    Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
    Write-Host "  -> stopped argus (port $ArgusPort)"
  }
} catch {}

# --- 2. remove the SessionStart hook from ~/.claude/settings.json ------------
# Drops any SessionStart entry whose command runs argus-activate.js. Leaves the
# rest of the file untouched.
if (Test-Path $Settings) {
  try {
    $json = Get-Content $Settings -Raw | ConvertFrom-Json
    if ($json.hooks -and $json.hooks.SessionStart) {
      $start = @($json.hooks.SessionStart)
      $kept  = @($start | Where-Object {
        $entry = $_
        -not (@($entry.hooks) | Where-Object { "$($_.command)" -like '*argus-activate*' })
      })
      $removed = $start.Count - $kept.Count
      if ($removed -gt 0) {
        $json.hooks.SessionStart = $kept
        $json | ConvertTo-Json -Depth 100 | Set-Content $Settings -Encoding UTF8
        Write-Host "  -> removed $removed hook(s) from $Settings"
      }
    }
  } catch {
    Write-Host "  -> skipped $Settings (could not parse)"
  }
}

# --- 3. remove ~/.argus/bin from the user PATH ------------------------------
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($userPath -and ($userPath -like "*$BinDir*")) {
  $new = (($userPath -split ';') | Where-Object { $_ -and $_ -ne $BinDir }) -join ';'
  [Environment]::SetEnvironmentVariable('Path', $new, 'User')
  $env:Path = (($env:Path -split ';') | Where-Object { $_ -and $_ -ne $BinDir }) -join ';'
  Write-Host "  -> removed PATH entry from your user environment"
}

# --- 4. remove ~/.argus -----------------------------------------------------
# WARNING: this deletes argus.db (all captured events/sessions) and your saved
# GitHub token. It is irreversible.
if (Test-Path $ArgusDir) {
  Remove-Item -Recurse -Force $ArgusDir
  Write-Host "  -> removed $ArgusDir"
}

Write-Host ''
Write-Host 'argus uninstalled.'
