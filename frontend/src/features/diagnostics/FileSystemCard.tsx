import type { ComponentType, ReactNode } from 'react'
import { useState } from 'react'
import { format } from 'date-fns'
import {
  Braces,
  ChevronDown,
  ChevronRight,
  Cpu,
  Database,
  File,
  FileCode,
  Folder,
  FolderOpen,
  HardDrive,
  RefreshCw,
  ScrollText,
} from 'lucide-react'
import { CopyIconButton } from '@/components/shared/CopyIconButton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatBytes } from './utils'
import { useLogTail } from './hooks/useLogTail'
import type { DiagnosticsFileEntry, DiagnosticsFileSystem } from './types'

// Files at/above this size are flagged amber so disk-hogs (big logs, databases,
// a bloated binary) jump out at a glance — the "anything I should worry about?" signal.
const LARGE_FILE_BYTES = 10 * 1024 * 1024
const AMBER = 'border-[var(--cwd)] text-[var(--cwd)] bg-transparent'

// Mounts start collapsed; each open/closed toggle is remembered across reloads.
const FS_OPEN_KEY = 'argus:diag:fs-open'
function readOpenMounts(): Set<string> {
  try {
    const raw = localStorage.getItem(FS_OPEN_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

// Uniform file-type icon set (research: consistent iconography drives scannability).
function FileIcon({
  name,
  isBinary,
  className,
}: {
  name: string
  isBinary?: boolean
  className?: string
}) {
  if (isBinary) return <Cpu className={className} />
  const n = name.toLowerCase()
  if (n.endsWith('.log')) return <ScrollText className={className} />
  if (/\.(sqlite|db)$/.test(n)) return <Database className={className} />
  if (/\.(json|jsonl)$/.test(n)) return <Braces className={className} />
  if (/\.(js|mjs|cjs|ts|sh|py)$/.test(n)) return <FileCode className={className} />
  return <File className={className} />
}

function fmtDate(iso?: string | null): string | null {
  if (!iso) return null
  try {
    return format(new Date(iso), 'MMM d')
  } catch {
    return null
  }
}

function totalBytes(entries: DiagnosticsFileEntry[]): number {
  return entries.reduce((sum, e) => sum + (e.exists && e.sizeBytes ? e.sizeBytes : 0), 0)
}

function UninstalledBadge() {
  return (
    <Badge variant="outline" className={cn('h-5 text-[10px]', AMBER)}>
      Uninstalled
    </Badge>
  )
}

function reveal(path: string) {
  fetch('/api/diagnostics/reveal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  }).catch((err: unknown) => console.error('reveal failed', err))
}

function RowActions({ entry }: { entry: DiagnosticsFileEntry }) {
  // Reserve fixed width so rows don't shift when actions fade in on hover.
  return (
    <span className="flex w-[44px] items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
      {entry.exists && (
        <>
          <CopyIconButton
            text={entry.path}
            label={`Copy ${entry.name} path`}
            className="size-4 opacity-60 hover:opacity-100 hover:bg-transparent"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Show ${entry.name} in folder`}
            title="Show in folder"
            className="size-4 opacity-60 hover:opacity-100 hover:bg-transparent"
            onClick={() => reveal(entry.path)}
          >
            <FolderOpen className="size-3.5" />
          </Button>
        </>
      )}
    </span>
  )
}

type FileRowProps = {
  entry: DiagnosticsFileEntry
  isBinary?: boolean
  meta?: string | null
  children?: ReactNode
}

// One file = one row: [type icon] name … size · date · hover-actions [· trailing slot].
// Filenames in mono; size right-aligned + tabular so the column reads as a list.
function FileRow({ entry, isBinary, meta, children }: FileRowProps) {
  const date = fmtDate(entry.lastModified)
  const dim = !entry.exists || entry.name.startsWith('.')
  const large = entry.exists && entry.sizeBytes != null && entry.sizeBytes >= LARGE_FILE_BYTES
  return (
    <div className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/50">
      <FileIcon
        name={entry.name}
        isBinary={isBinary}
        className={cn(
          'size-3.5 shrink-0',
          dim ? 'text-muted-foreground/50' : 'text-muted-foreground'
        )}
      />
      <span
        className={cn('truncate text-[12px]', dim ? 'text-muted-foreground' : 'text-foreground')}
        title={entry.name}
      >
        {entry.name}
      </span>
      <div className="flex items-center justify-end gap-2.5 text-[12px]">
        {meta && <span className="tabular-nums text-muted-foreground">{meta}</span>}
        <span
          className={cn(
            'w-[72px] text-right tabular-nums',
            !entry.exists
              ? 'text-muted-foreground'
              : large
                ? 'font-medium text-[var(--cwd)]'
                : 'text-foreground/80'
          )}
        >
          {entry.exists
            ? entry.sizeBytes != null
              ? formatBytes(entry.sizeBytes)
              : 'Unknown'
            : 'Not found'}
        </span>
        <span className="w-9 text-right text-[11px] text-muted-foreground">{date}</span>
        <RowActions entry={entry} />
        {children}
      </div>
    </div>
  )
}

// Sub-group divider inside a mount (logs / hooks / databases / history).
function GroupLabel({
  label,
  count,
  total,
  missing,
}: {
  label: string
  count: number
  total?: number
  missing?: boolean
}) {
  const truncated = total !== undefined && total > count
  return (
    <div className="flex items-center gap-2 px-2 pb-0.5 pt-2.5 first:pt-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
        {label}
      </span>
      <span className="text-[10px] tabular-nums text-muted-foreground/70">
        {truncated ? `${count} of ${total!.toLocaleString()}` : count}
      </span>
      {missing && <UninstalledBadge />}
      <span className="h-px flex-1 bg-border/60" />
    </div>
  )
}

type MountProps = {
  icon: ComponentType<{ className?: string }>
  label: string
  role: string
  path: string
  exists?: boolean
  fileCount: number
  sizeBytes: number
  open: boolean
  onToggle: () => void
  children: ReactNode
}

// A root directory = a "mount": identifiable header (icon + name + plain-language role)
// with at-a-glance file count + total size, collapsible to fold away noise.
function Mount({
  icon: Icon,
  label,
  role,
  path,
  exists = true,
  fileCount,
  sizeBytes,
  open,
  onToggle,
  children,
}: MountProps) {
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`Toggle ${label}`}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <Chevron className="size-4 shrink-0 text-muted-foreground" />
          <span
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-lg',
              exists ? 'bg-muted text-foreground' : 'bg-muted/50 text-muted-foreground'
            )}
          >
            <Icon className="size-4" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-foreground">{label}</span>
              {!exists && <UninstalledBadge />}
            </span>
            <span className="truncate text-[11px] text-muted-foreground">{role}</span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex flex-col items-end gap-0.5 text-[11px] text-muted-foreground">
            {exists && (
              <span className="tabular-nums">
                {fileCount} {fileCount === 1 ? 'file' : 'files'} · {formatBytes(sizeBytes)}
              </span>
            )}
            <span
              className="max-w-[260px] truncate text-[10px] text-muted-foreground/70"
              title={path}
            >
              {path}
            </span>
          </div>
          <CopyIconButton
            text={path}
            label={`Copy ${label} path`}
            className="size-4 opacity-50 hover:opacity-100 hover:bg-transparent"
          />
        </div>
      </div>
      {open && (
        <div className="border-t border-border/70 px-2 pb-2">
          {exists ? (
            children
          ) : (
            <p className="px-2 py-2 text-[12px] text-muted-foreground">Directory not present.</p>
          )}
        </div>
      )}
    </div>
  )
}

function EmptyGroup({ label }: { label: string }) {
  return <p className="px-2 py-1 text-[12px] text-muted-foreground">{label}</p>
}

type FileSystemCardProps = {
  fileSystem: DiagnosticsFileSystem
  'data-tour'?: string
}

export function FileSystemCard({ fileSystem: fs, 'data-tour': dataTour }: FileSystemCardProps) {
  const argusTail = useLogTail('argus', 50)
  const buildTail = useLogTail('build', 50)
  const hookScriptsTail = useLogTail('hook-scripts', 50)
  const [openLog, setOpenLog] = useState<string | null>(null)
  const [openMounts, setOpenMounts] = useState<Set<string>>(readOpenMounts)

  const tailFor = (name: string) =>
    name === 'argus.log' ? argusTail : name === 'hook-scripts.log' ? hookScriptsTail : buildTail

  function toggleLog(name: string) {
    const opening = openLog !== name
    setOpenLog(opening ? name : null)
    if (opening) tailFor(name).fetch()
  }

  function toggleMount(id: string) {
    setOpenMounts((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try {
        localStorage.setItem(FS_OPEN_KEY, JSON.stringify([...next]))
      } catch {
        /* localStorage unavailable */
      }
      return next
    })
  }
  const isOpen = (id: string) => openMounts.has(id)

  const claudeHooks = fs.claudeHooks ?? []
  const codexHooks = fs.codexHooks ?? []
  const codexDBs = fs.codexDBs ?? []

  const argusFileCount = 1 + fs.logs.length + fs.hooks.length
  const argusSize =
    (fs.binary.exists && fs.binary.sizeBytes ? fs.binary.sizeBytes : 0) +
    totalBytes(fs.logs) +
    totalBytes(fs.hooks)
  const claudeFileCount = claudeHooks.length + (fs.claudeHistory.exists ? 1 : 0)
  const claudeSize = totalBytes(claudeHooks) + totalBytes([fs.claudeHistory])

  return (
    <Card data-tour={dataTour}>
      <CardHeader>
        <CardTitle>File System</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* ~/.argus — the install */}
        <Mount
          icon={HardDrive}
          label="~/.argus"
          role="Argus install — binary, logs, and your hook scripts"
          path={fs.argusDir}
          fileCount={argusFileCount}
          sizeBytes={argusSize}
          open={isOpen('argus')}
          onToggle={() => toggleMount('argus')}
        >
          <GroupLabel label="binary" count={1} />
          <FileRow entry={fs.binary} isBinary />
          {!fs.binary.exists && (
            <div className="px-2 py-1">
              <Badge variant="outline" className={AMBER}>
                Binary not installed
              </Badge>
            </div>
          )}

          <GroupLabel label="logs" count={fs.logs.length} />
          {fs.logs.map((entry) => {
            const t = tailFor(entry.name)
            return (
              <div key={entry.name}>
                <FileRow entry={entry}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => toggleLog(entry.name)}
                    aria-label={`Tail ${entry.name}`}
                  >
                    {openLog === entry.name ? 'Close' : 'Tail'}
                  </Button>
                </FileRow>
                {openLog === entry.name && (
                  <div className="mb-2 ml-2 mt-1 rounded border border-border bg-[var(--secondary)] p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">Last 50 lines</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={t.fetch}
                        disabled={t.loading}
                        aria-label="Refresh log"
                      >
                        <RefreshCw className={cn('size-3', t.loading && 'animate-spin')} />
                      </Button>
                    </div>
                    {t.error && <p className="text-[12px] text-destructive">{t.error}</p>}
                    {!t.error && t.lines.length === 0 && !t.loading && (
                      <p className="text-[12px] text-muted-foreground">
                        Log file is empty or not found
                      </p>
                    )}
                    {t.lines.length > 0 && (
                      <pre className="max-h-[320px] overflow-y-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed">
                        {t.lines.map((line, i) => (
                          <div key={i}>{line}</div>
                        ))}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          <GroupLabel label="hooks" count={fs.hooks.length} total={fs.hooksTotal} />
          {fs.hooks.length === 0 ? (
            <EmptyGroup label="No hook scripts installed" />
          ) : (
            fs.hooks.map((entry) => <FileRow key={entry.name} entry={entry} />)
          )}
        </Mount>

        {/* ~/.claude — Claude Code */}
        <Mount
          icon={Folder}
          label="~/.claude"
          role="Claude Code — hooks and prompt history"
          path={fs.claudeDir}
          exists={fs.claudeDirExists}
          fileCount={claudeFileCount}
          sizeBytes={claudeSize}
          open={isOpen('claude')}
          onToggle={() => toggleMount('claude')}
        >
          <GroupLabel
            label="hooks"
            count={claudeHooks.length}
            total={fs.claudeHooksTotal}
            missing={!fs.claudeHooksDirExists}
          />
          {!fs.claudeHooksDirExists ? (
            <EmptyGroup label="Hooks directory not present" />
          ) : claudeHooks.length === 0 ? (
            <EmptyGroup label="No hooks configured" />
          ) : (
            claudeHooks.map((entry) => <FileRow key={entry.name} entry={entry} />)
          )}

          <GroupLabel label="history" count={fs.claudeHistory.exists ? 1 : 0} />
          <FileRow
            entry={fs.claudeHistory}
            meta={
              fs.claudeHistory.lineCount != null
                ? `${fs.claudeHistory.lineCount.toLocaleString()} lines`
                : null
            }
          />
        </Mount>

        {/* ~/.codex — Codex */}
        <Mount
          icon={Folder}
          label="~/.codex"
          role="Codex — hooks and databases"
          path={fs.codexDir}
          exists={fs.codexDirExists}
          fileCount={codexHooks.length + codexDBs.length}
          sizeBytes={totalBytes(codexHooks) + totalBytes(codexDBs)}
          open={isOpen('codex')}
          onToggle={() => toggleMount('codex')}
        >
          <GroupLabel
            label="hooks"
            count={codexHooks.length}
            total={fs.codexHooksTotal}
            missing={!fs.codexHooksDirExists}
          />
          {!fs.codexHooksDirExists ? (
            <EmptyGroup label="Hooks directory not present" />
          ) : codexHooks.length === 0 ? (
            <EmptyGroup label="No hooks configured" />
          ) : (
            codexHooks.map((entry) => <FileRow key={entry.name} entry={entry} />)
          )}

          <GroupLabel
            label="databases"
            count={codexDBs.length}
            total={fs.codexDBsTotal}
            missing={!fs.codexDBsDirExists}
          />
          {!fs.codexDBsDirExists ? (
            <EmptyGroup label="Databases directory not present" />
          ) : codexDBs.length === 0 ? (
            <EmptyGroup label="No databases found" />
          ) : (
            codexDBs.map((entry) => <FileRow key={entry.name} entry={entry} />)
          )}
        </Mount>
      </CardContent>
    </Card>
  )
}
