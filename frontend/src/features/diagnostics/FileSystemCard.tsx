import { format } from 'date-fns'
import { RefreshCw } from 'lucide-react'
import { CopyIconButton } from '@/components/shared/CopyIconButton'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { formatBytes } from './utils'
import { useLogTail } from './hooks/useLogTail'
import type { DiagnosticsFileEntry, DiagnosticsFileSystem } from './types'

const BADGE_AMBER = 'border-[var(--cwd)] text-[var(--cwd)] bg-transparent'

function UninstalledBadge() {
  return (
    <Badge variant="outline" className={BADGE_AMBER}>
      Uninstalled
    </Badge>
  )
}

type FileSystemCardProps = {
  fileSystem: DiagnosticsFileSystem
}

function FileSize({ entry }: { entry: DiagnosticsFileEntry }) {
  if (!entry.exists) {
    return <span className="text-[12px] text-muted-foreground">Not found</span>
  }
  return (
    <span className="text-[13px]">
      {entry.sizeBytes !== null ? formatBytes(entry.sizeBytes) : 'Unknown'}
    </span>
  )
}

function FileModified({ entry }: { entry: DiagnosticsFileEntry }) {
  if (!entry.exists || !entry.lastModified) return null
  let label: string
  try {
    label = format(new Date(entry.lastModified), 'MMM d')
  } catch {
    return null
  }
  return <span className="text-[12px] text-muted-foreground">{label}</span>
}

type TailPanelProps = {
  lines: string[]
  loading: boolean
  error: string | null
  onRefresh: () => void
}

function TailPanel({ lines, loading, error, onRefresh }: TailPanelProps) {
  return (
    <div className="mt-2 rounded border border-border bg-[var(--secondary)] p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-muted-foreground">Last 50 lines</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Refresh log"
        >
          <RefreshCw className={cn('size-3', loading && 'animate-spin')} />
        </Button>
      </div>
      {error && <p className="text-[12px] text-destructive">{error}</p>}
      {!error && lines.length === 0 && !loading && (
        <p className="text-[12px] text-muted-foreground">Log file is empty or not found</p>
      )}
      {lines.length > 0 && (
        <pre className="font-mono text-[11px] leading-relaxed overflow-y-auto max-h-[320px] whitespace-pre-wrap break-all">
          {lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </pre>
      )}
    </div>
  )
}

type LogRowProps = {
  entry: DiagnosticsFileEntry
  open: boolean
  onToggle: () => void
  tailState: { lines: string[]; loading: boolean; error: string | null }
  onRefresh: () => void
}

function LogRow({ entry, open, onToggle, tailState, onRefresh }: LogRowProps) {
  return (
    <div>
      <div className="flex items-center justify-between py-1.5 text-[13px]">
        <span className="font-mono text-[12px]">{entry.name}</span>
        <div className="flex items-center gap-2 shrink-0">
          <FileSize entry={entry} />
          <FileModified entry={entry} />
          {entry.exists && (
            <CopyIconButton
              text={entry.path}
              label={`Copy ${entry.name} path`}
              className="size-4 opacity-40 hover:opacity-100 hover:bg-transparent"
            />
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={onToggle}
            aria-label={`Tail ${entry.name}`}
          >
            {open ? 'Close' : 'Tail'}
          </Button>
        </div>
      </div>
      {open && <TailPanel {...tailState} onRefresh={onRefresh} />}
    </div>
  )
}

type SubSectionProps = {
  label: string
  entries: DiagnosticsFileEntry[]
  dirExists: boolean
  emptyLabel?: string
}

function SubSection({ label, entries, dirExists, emptyLabel }: SubSectionProps) {
  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[11px] font-mono text-muted-foreground">{label}</span>
        <span className="text-[11px] text-muted-foreground">({entries.length})</span>
        {!dirExists && <UninstalledBadge />}
      </div>
      {entries.length === 0 && dirExists ? (
        <p className="text-[12px] text-muted-foreground pl-3 py-1">{emptyLabel ?? 'No files found'}</p>
      ) : (
        <div className="border-l border-border pl-3">
          {entries.map((entry, i) => (
            <div key={entry.name}>
              {i > 0 && <Separator />}
              <div className="flex items-center justify-between py-1.5 text-[13px]">
                <span className="font-mono text-[12px]">{entry.name}</span>
                <div className="flex items-center gap-2">
                  <FileSize entry={entry} />
                  <FileModified entry={entry} />
                  <CopyIconButton
                    text={entry.path}
                    label={`Copy ${entry.name} path`}
                    className="size-4 opacity-40 hover:opacity-100 hover:bg-transparent"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function FileSystemCard({ fileSystem }: FileSystemCardProps) {
  const hookerTail = useLogTail('hooker', 50)
  const buildTail = useLogTail('build', 50)
  const [openLog, setOpenLog] = useState<string | null>(null)

  function toggleLog(name: string) {
    const opening = openLog !== name
    setOpenLog(opening ? name : null)
    if (opening) {
      if (name === 'hooker.log') hookerTail.fetch()
      else if (name === 'build.log') buildTail.fetch()
    }
  }

  function tailStateFor(name: string) {
    const t = name === 'hooker.log' ? hookerTail : buildTail
    return { lines: t.lines, loading: t.loading, error: t.error }
  }

  function refreshFor(name: string) {
    return name === 'hooker.log' ? hookerTail.fetch : buildTail.fetch
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>File System</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-0">
        {/* Root dir */}
        <div className="flex items-center justify-between py-2 text-[13px]">
          <span className="text-muted-foreground">~/.hooker</span>
          <span className="flex items-center gap-1">
            <span
              className="font-mono text-[12px] text-foreground truncate max-w-[300px]"
              title={fileSystem.hookerDir}
            >
              {fileSystem.hookerDir}
            </span>
            <CopyIconButton
              text={fileSystem.hookerDir}
              label="Copy .hooker path"
              className="size-4 opacity-40 hover:opacity-100 hover:bg-transparent"
            />
          </span>
        </div>
        <Separator />

        {/* Binary */}
        <div className="flex items-center justify-between py-2 text-[13px]">
          <span className="text-muted-foreground">Binary</span>
          <div className="flex items-center gap-2">
            <span
              className="font-mono text-[12px] text-foreground truncate max-w-[200px]"
              title={fileSystem.binary.path}
            >
              {fileSystem.binary.path}
            </span>
            <FileSize entry={fileSystem.binary} />
            <FileModified entry={fileSystem.binary} />
            {fileSystem.binary.exists && (
              <CopyIconButton
                text={fileSystem.binary.path}
                label="Copy binary path"
                className="size-4 opacity-40 hover:opacity-100 hover:bg-transparent"
              />
            )}
          </div>
        </div>
        <Separator />

        {/* Logs */}
        <div className="mt-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-mono text-muted-foreground">logs</span>
            <span className="text-[11px] text-muted-foreground">({fileSystem.logs.length})</span>
          </div>
          <div className="border-l border-border pl-3">
            {fileSystem.logs.map((entry, i) => (
              <div key={entry.name}>
                {i > 0 && <Separator />}
                <LogRow
                  entry={entry}
                  open={openLog === entry.name}
                  onToggle={() => toggleLog(entry.name)}
                  tailState={tailStateFor(entry.name)}
                  onRefresh={refreshFor(entry.name)}
                />
              </div>
            ))}
          </div>
        </div>
        <Separator />

        {/* ~/.hooker/hooks */}
        <SubSection label="hooks" entries={fileSystem.hooks} dirExists={true} />

        <Separator />

        {/* ~/.claude */}
        <div className="flex items-center justify-between py-2 text-[13px]">
          <span className="text-muted-foreground">~/.claude</span>
          <span className="flex items-center gap-1">
            <span className="font-mono text-[12px] text-foreground truncate max-w-[300px]" title={fileSystem.claudeDir}>
              {fileSystem.claudeDir}
            </span>
            {fileSystem.claudeDirExists ? (
              <CopyIconButton text={fileSystem.claudeDir} label="Copy .claude path" className="size-4 opacity-40 hover:opacity-100 hover:bg-transparent" />
            ) : (
              <UninstalledBadge />
            )}
          </span>
        </div>
        <SubSection label="hooks" entries={fileSystem.claudeHooks ?? []} dirExists={fileSystem.claudeHooksDirExists} />
        <div className="mt-2 border-l border-border pl-3">
          <div className="flex items-center justify-between py-1.5 text-[13px]">
            <span className="font-mono text-[12px]">history.jsonl</span>
            <div className="flex items-center gap-2">
              <FileSize entry={fileSystem.claudeHistory} />
              {fileSystem.claudeHistory.lineCount != null && (
                <span className="text-[12px] text-muted-foreground">
                  {fileSystem.claudeHistory.lineCount.toLocaleString()} lines
                </span>
              )}
              <FileModified entry={fileSystem.claudeHistory} />
              {fileSystem.claudeHistory.exists && (
                <CopyIconButton text={fileSystem.claudeHistory.path} label="Copy history.jsonl path" className="size-4 opacity-40 hover:opacity-100 hover:bg-transparent" />
              )}
            </div>
          </div>
        </div>

        <Separator />

        {/* ~/.codex */}
        <div className="flex items-center justify-between py-2 text-[13px]">
          <span className="text-muted-foreground">~/.codex</span>
          <span className="flex items-center gap-1">
            <span className="font-mono text-[12px] text-foreground truncate max-w-[300px]" title={fileSystem.codexDir}>
              {fileSystem.codexDir}
            </span>
            {fileSystem.codexDirExists ? (
              <CopyIconButton text={fileSystem.codexDir} label="Copy .codex path" className="size-4 opacity-40 hover:opacity-100 hover:bg-transparent" />
            ) : (
              <UninstalledBadge />
            )}
          </span>
        </div>
        <SubSection label="hooks" entries={fileSystem.codexHooks ?? []} dirExists={fileSystem.codexHooksDirExists} />
        <SubSection label="databases" entries={fileSystem.codexDBs ?? []} dirExists={fileSystem.codexDBsDirExists} emptyLabel="No databases found" />

        {/* Warning for missing binary */}
        {!fileSystem.binary.exists && (
          <div className="mt-2">
            <Badge
              variant="outline"
              className="border-[var(--cwd)] text-[var(--cwd)] bg-transparent"
            >
              Binary not installed
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
