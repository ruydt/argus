import { useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  FileCode2,
  FilePen,
  FileText,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { DiffBlock } from '@/features/events/renderers/DiffBlock'
import { shortenCwd } from './utils'
import type { FileChangeEvent, FileChangeGroup } from '@/types/sessions'

const DEFAULT_PAGE_SIZE = 25

type ToolTone = 'write' | 'edit' | 'multi' | 'fallback'

function toolTone(tool = ''): ToolTone {
  const t = tool.toLowerCase()
  if (t === 'write' || t === 'create_file' || t === 'new_file' || t === 'create') return 'write'
  if (t === 'edit' || t === 'str_replace' || t.includes('str_replace')) return 'edit'
  if (t === 'multiedit' || t === 'notebook_edit') return 'multi'
  return 'fallback'
}

function toolLabel(tool = '', action = ''): string {
  const t = tool.toLowerCase()
  if (!t) return action.toLowerCase() || 'change'
  if (t === 'write' || t === 'create_file' || t === 'new_file') return 'write'
  if (t.includes('str_replace') || t === 'edit') return 'edit'
  if (t === 'multiedit') return 'multiedit'
  if (t === 'notebook_edit') return 'notebook'
  return t
}

function toolBadgeClass(tool = ''): string {
  switch (toolTone(tool)) {
    case 'write':
      return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
    case 'edit':
      return 'border-sky-400/25 bg-sky-400/10 text-sky-200'
    case 'multi':
      return 'border-violet-400/25 bg-violet-400/10 text-violet-200'
    default:
      return 'border-amber-400/25 bg-amber-400/10 text-amber-200'
  }
}

function fileIconClass(tool = ''): string {
  switch (toolTone(tool)) {
    case 'write':
      return 'text-emerald-300/80'
    case 'multi':
      return 'text-violet-300/80'
    case 'fallback':
      return 'text-amber-300/80'
    default:
      return 'text-sky-300/80'
  }
}

function FileIcon({ tool }: { tool?: string }) {
  const className = `size-4 shrink-0 ${fileIconClass(tool)}`
  switch (toolTone(tool)) {
    case 'write':
      return <FileText className={className} />
    case 'multi':
      return <FileCode2 className={className} />
    default:
      return <FilePen className={className} />
  }
}

function formatRelativeTime(iso: string, sessionStart: string): string {
  const time = new Date(iso).getTime()
  const start = new Date(sessionStart).getTime()
  if (!Number.isFinite(time)) return iso
  if (!Number.isFinite(start)) return new Date(time).toLocaleTimeString()

  const ms = time - start
  if (ms < 0) return new Date(time).toLocaleTimeString()
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `+${secs}s`
  const mins = Math.floor(secs / 60)
  const rem = secs % 60
  if (mins < 60) return `+${mins}m ${rem}s`
  const hrs = Math.floor(mins / 60)
  return `+${hrs}h ${mins % 60}m`
}

function latestChangeTime(group: FileChangeGroup): string {
  return group.changes.at(-1)?.time ?? ''
}

type FileChangesListProps = {
  groups: FileChangeGroup[]
  sessionStartedAt: string
  loading: boolean
  error: string | null
}

export function FileChangesList({
  groups,
  sessionStartedAt,
  loading,
  error,
}: FileChangesListProps) {
  const [page, setPage] = useState(0)
  const [expandedPath, setExpandedPath] = useState<string | null>(null)
  const totalPages = Math.max(1, Math.ceil(groups.length / DEFAULT_PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const rangeStart = groups.length === 0 ? 0 : safePage * DEFAULT_PAGE_SIZE
  const rangeEnd = Math.min(rangeStart + DEFAULT_PAGE_SIZE, groups.length)

  const pageGroups = useMemo(
    () => groups.slice(rangeStart, rangeEnd),
    [groups, rangeEnd, rangeStart]
  )

  const goToPage = (nextPage: number) => {
    const bounded = Math.max(0, Math.min(nextPage, totalPages - 1))
    setPage(bounded)
    setExpandedPath(null)
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="text-sm text-black/45">Loading file changes…</div>
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-14 border border-black/10 bg-black/[0.05]" />
        ))}
      </div>
    )
  }

  if (error) {
    return <div className="text-sm text-red-400">Failed to load file changes: {error}</div>
  }

  if (groups.length === 0) {
    return (
      <Empty className="min-h-[18rem] border border-black/10 bg-black/[0.02] text-[#171717]">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="bg-black/[0.05] text-black/60">
            <FileText className="size-4" />
          </EmptyMedia>
          <EmptyTitle>No file changes recorded for this session.</EmptyTitle>
          <EmptyDescription className="text-black/45">
            This session did not create or modify files that argus captured.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="space-y-3">
      <FilePagination
        page={safePage}
        totalPages={totalPages}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        totalItems={groups.length}
        onPageChange={goToPage}
      />

      <div className="space-y-2">
        {pageGroups.map((group) => (
          <FileChangeRow
            key={group.path}
            group={group}
            sessionStartedAt={sessionStartedAt}
            expanded={expandedPath === group.path}
            onToggle={() =>
              setExpandedPath((current) => (current === group.path ? null : group.path))
            }
          />
        ))}
      </div>
    </div>
  )
}

type FilePaginationProps = {
  page: number
  totalPages: number
  rangeStart: number
  rangeEnd: number
  totalItems: number
  onPageChange: (page: number) => void
}

function FilePagination({
  page,
  totalPages,
  rangeStart,
  rangeEnd,
  totalItems,
  onPageChange,
}: FilePaginationProps) {
  if (totalItems === 0) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 pb-3 text-[12px] text-black/55">
      <div className="font-mono">
        {rangeStart + 1}-{rangeEnd} of {totalItems} files
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            onClick={() => onPageChange(0)}
            disabled={page === 0}
            aria-label="First page"
          >
            <ChevronFirst />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            onClick={() => onPageChange(page - 1)}
            disabled={page === 0}
            aria-label="Previous page"
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-12 px-2 text-center text-[11px] text-black/65">
            {page + 1}/{totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages - 1}
            aria-label="Next page"
          >
            <ChevronRight />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            onClick={() => onPageChange(totalPages - 1)}
            disabled={page >= totalPages - 1}
            aria-label="Last page"
          >
            <ChevronLast />
          </Button>
        </div>
      )}
    </div>
  )
}

type FileChangeRowProps = {
  group: FileChangeGroup
  sessionStartedAt: string
  expanded: boolean
  onToggle: () => void
}

function FileChangeRow({ group, sessionStartedAt, expanded, onToggle }: FileChangeRowProps) {
  const firstTool = group.changes[0]?.tool
  const latestTime = latestChangeTime(group)

  return (
    <Card size="sm" className="gap-0 rounded-lg border-black/10 bg-[#111216] py-0 text-[#171717]">
      <Button
        type="button"
        variant="ghost"
        className="h-auto w-full justify-start gap-3 rounded-none p-3 text-left hover:bg-black/[0.04]"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <FileIcon tool={firstTool} />
        <span
          className="min-w-0 flex-1 truncate text-[12px] text-black/80"
          title={group.path}
        >
          {shortenCwd(group.path)}
        </span>
        <Badge
          variant="outline"
          className="shrink-0 border-black/15 bg-black/[0.04] text-[10px] text-black/60"
        >
          {group.count}x
        </Badge>
        {latestTime && (
          <span className="hidden shrink-0 text-[10px] text-black/45 sm:inline">
            {formatRelativeTime(latestTime, sessionStartedAt)}
          </span>
        )}
        {expanded ? (
          <ChevronDown className="size-4 shrink-0 text-black/45" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-black/45" />
        )}
      </Button>

      {expanded && (
        <div className="space-y-2 border-t border-black/10 p-3">
          {group.changes.map((change, index) => (
            <ChangeEntry
              key={`${change.time}-${change.tool}-${change.start_line ?? 'line'}-${index}`}
              change={change}
              sessionStartedAt={sessionStartedAt}
            />
          ))}
        </div>
      )}
    </Card>
  )
}

type ChangeEntryProps = {
  change: FileChangeEvent
  sessionStartedAt: string
}

function ChangeEntry({ change, sessionStartedAt }: ChangeEntryProps) {
  const hasOld = Boolean(change.old_string)
  const hasNew = Boolean(change.new_string)

  return (
    <div className="rounded-md border border-black/10 bg-black/[0.04] p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={toolBadgeClass(change.tool)}>
          {toolLabel(change.tool, change.action)}
        </Badge>
        <span className="text-[10px] text-black/45">
          {formatRelativeTime(change.time, sessionStartedAt)}
        </span>
        {change.start_line && (
          <Badge
            variant="outline"
            className="border-black/15 bg-black/[0.04] text-[10px] text-black/55"
          >
            L{change.start_line}
          </Badge>
        )}
      </div>

      {hasOld || hasNew ? (
        <div className="mt-2 overflow-x-auto rounded-md">
          <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-black/45">
            {hasOld && <span>Before</span>}
            {hasOld && hasNew && <span className="text-black/20">/</span>}
            {hasNew && <span>After</span>}
          </div>
          <DiffBlock
            oldStr={change.old_string ?? ''}
            newStr={change.new_string ?? ''}
            startLine={change.start_line ?? 0}
          />
        </div>
      ) : (
        <div className="mt-2 text-[12px] text-black/40">
          No inline snippet captured for this change.
        </div>
      )}
    </div>
  )
}
