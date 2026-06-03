import { useState } from 'react'
import { ChevronDown, ChevronRight, FileCode2, FilePen, FileText, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { FileChangeEvent, FileChangeGroup } from '@/types/sessions'

type FileChangesDrawerProps = {
  sessionId: string
  sessionStartedAt: string
  groups: FileChangeGroup[]
  loading: boolean
  error: string | null
  onClose: () => void
}

function toolColor(tool: string): string {
  const t = tool.toLowerCase()
  if (t === 'write' || t === 'create_file' || t === 'new_file' || t === 'create')
    return 'linear-gradient(90deg,rgba(16,185,129,0.95),rgba(52,211,153,0.82))'
  if (t === 'edit' || t === 'str_replace' || t.includes('str_replace'))
    return 'linear-gradient(90deg,rgba(56,189,248,0.95),rgba(59,130,246,0.82))'
  if (t === 'multiedit' || t === 'notebook_edit')
    return 'linear-gradient(90deg,rgba(139,92,246,0.95),rgba(168,85,247,0.82))'
  return 'linear-gradient(90deg,rgba(249,115,22,0.95),rgba(251,146,60,0.82))'
}

function toolLabel(tool: string): string {
  const t = tool.toLowerCase()
  if (!t) return 'change'
  if (t === 'write' || t === 'create_file' || t === 'new_file') return 'write'
  if (t.includes('str_replace') || t === 'edit') return 'edit'
  if (t === 'multiedit') return 'multiedit'
  if (t === 'notebook_edit') return 'notebook'
  return t
}

function FileIcon({ tool }: { tool: string }) {
  const t = tool.toLowerCase()
  if (t === 'write' || t === 'create_file' || t === 'new_file')
    return <FileText className="size-3.5 shrink-0 text-emerald-400/70" />
  if (t === 'multiedit' || t === 'notebook_edit')
    return <FileCode2 className="size-3.5 shrink-0 text-purple-400/70" />
  return <FilePen className="size-3.5 shrink-0 text-sky-400/70" />
}

function shortenPath(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, '~').replace(/^\/home\/[^/]+/, '~')
}

function formatRelativeTime(iso: string, sessionStart: string): string {
  const t = new Date(iso).getTime()
  const s = new Date(sessionStart).getTime()
  const ms = t - s
  if (ms < 0) return iso.split('T')[1]?.slice(0, 8) ?? iso
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `+${secs}s`
  const mins = Math.floor(secs / 60)
  const rem = secs % 60
  if (mins < 60) return `+${mins}m ${rem}s`
  const hrs = Math.floor(mins / 60)
  const remM = mins % 60
  return `+${hrs}h ${remM}m`
}

type FileRowProps = {
  group: FileChangeGroup
  sessionStart: string
}

function FileRow({ group, sessionStart }: FileRowProps) {
  const [open, setOpen] = useState(false)
  const firstTool = group.changes[0]?.tool ?? ''

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-white/[0.04] transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <FileIcon tool={firstTool} />
        <span className="flex-1 truncate font-mono text-[11px] text-white/75" title={group.path}>
          {shortenPath(group.path)}
        </span>
        <span className="shrink-0 rounded border border-white/10 bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-white/60">
          {group.count}×
        </span>
        {open ? (
          <ChevronDown className="size-3 shrink-0 text-white/35" />
        ) : (
          <ChevronRight className="size-3 shrink-0 text-white/35" />
        )}
      </button>

      {open && (
        <div className="border-t border-white/10 px-3 py-2 space-y-1.5">
          {group.changes.map((ev) => (
            <ChangeRow key={`${ev.time}-${ev.tool}`} ev={ev} sessionStart={sessionStart} />
          ))}
        </div>
      )}
    </div>
  )
}

type ChangeRowProps = { ev: FileChangeEvent; sessionStart: string }

function ChangeRow({ ev, sessionStart }: ChangeRowProps) {
  const label = toolLabel(ev.tool)
  const color = toolColor(ev.tool)
  const relTime = formatRelativeTime(ev.time, sessionStart)
  const lineInfo = ev.start_line ? `L${ev.start_line}` : null

  // D-04: expandable code block with line numbers
  const content = ev.new_string ?? ev.old_string ?? null
  const canExpand = content !== null
  const [expanded, setExpanded] = useState(false)

  const lines = content?.split('\n') ?? []
  const startLine = ev.start_line ?? 1
  const truncated = lines.length > 200
  const displayLines = truncated ? lines.slice(0, 200) : lines
  const maxWidth = String(startLine + lines.length - 1).length

  // Show diffLines count only when canExpand is false (chevron replaces the count)
  const diffLines = !canExpand
    ? ev.new_string
      ? ev.new_string.split('\n').length
      : ev.old_string
        ? ev.old_string.split('\n').length
        : null
    : null

  return (
    <div>
      <button
        type="button"
        className={cn(
          'flex w-full items-center gap-2 py-0.5 text-left',
          canExpand && 'cursor-pointer hover:bg-white/[0.03] rounded'
        )}
        onClick={canExpand ? () => setExpanded((v) => !v) : undefined}
        disabled={!canExpand}
        style={!canExpand ? { cursor: 'default', background: 'none', border: 'none', padding: 0 } : undefined}
      >
        <span
          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
          style={{ background: color }}
        >
          {label}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-white/45">{relTime}</span>
        {lineInfo && (
          <span className="shrink-0 font-mono text-[10px] text-white/35">{lineInfo}</span>
        )}
        {canExpand && (
          <span className="ml-auto">
            {expanded ? (
              <ChevronDown className="size-3 shrink-0 text-white/35" />
            ) : (
              <ChevronRight className="size-3 shrink-0 text-white/35" />
            )}
          </span>
        )}
        {!canExpand && diffLines !== null && (
          <span className="ml-auto shrink-0 font-mono text-[10px] text-white/35">
            {diffLines} {diffLines === 1 ? 'line' : 'lines'}
          </span>
        )}
      </button>

      {expanded && canExpand && (
        <pre className="mt-1 overflow-x-auto rounded bg-black/30 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-blue-100/80">
          {displayLines.map(
            (line, i) => `${String(startLine + i).padStart(maxWidth, ' ')} │ ${line}\n`
          )}
          {truncated && (
            <span className="text-white/35">{`… ${lines.length - 200} more lines`}</span>
          )}
        </pre>
      )}
    </div>
  )
}

export function FileChangesDrawer({
  sessionId,
  sessionStartedAt,
  groups,
  loading,
  error,
  onClose,
}: FileChangesDrawerProps) {
  return (
    <div
      className="flex h-full flex-col bg-[#0d0d0d] text-white w-full overflow-hidden"
      style={{ boxShadow: '-4px 0 24px -8px rgba(0,0,0,0.6)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/10 bg-black/20 px-4 py-3 shrink-0">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-white/45">
            File Changes
          </div>
          <div className="mt-0.5 font-mono text-[12px] text-white/60 truncate">
            {sessionId.slice(0, 12)}
          </div>
        </div>
        {!loading && groups.length > 0 && (
          <Badge
            variant="outline"
            className="shrink-0 border-white/15 bg-white/[0.06] text-white/70 text-[11px]"
          >
            {groups.length} {groups.length === 1 ? 'file' : 'files'}
          </Badge>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-white/45 hover:text-white hover:bg-white/10"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>

      <Separator className="bg-white/10 shrink-0" />

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden w-full [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb:hover]:bg-white/30">
        <div className="p-4 w-full overflow-x-hidden">
          {loading && <div className="text-sm text-white/45">Loading file changes…</div>}
          {error && <div className="text-sm text-red-400/80">Failed to load: {error}</div>}
          {!loading && !error && groups.length === 0 && (
            <div className="text-sm text-white/40">No file changes recorded for this session.</div>
          )}
          {!loading && !error && groups.length > 0 && (
            <div className="space-y-2">
              {groups.map((group) => (
                <FileRow key={group.path} group={group} sessionStart={sessionStartedAt} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
