import { useEffect, useRef, useState } from 'react'
import { Columns2, ListFilter, RefreshCw, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const HOOK_EVENT_VALUES = [
  'SessionStart',
  'SessionEnd',
  'Setup',
  'UserPromptSubmit',
  'UserPromptExpansion',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PostToolBatch',
  'PermissionRequest',
  'PermissionDenied',
  'Stop',
  'StopFailure',
  'SubagentStart',
  'SubagentStop',
  'TaskCreated',
  'TaskCompleted',
  'PreCompact',
  'PostCompact',
  'FileChanged',
  'CwdChanged',
  'ConfigChange',
  'InstructionsLoaded',
  'MessageDisplay',
  'Notification',
  'WorktreeCreate',
  'WorktreeRemove',
  'Elicitation',
  'ElicitationResult',
]

const ACTION_OPTIONS = [
  { label: 'All', value: 'all' },
  ...HOOK_EVENT_VALUES.map((e) => ({ label: e, value: e })),
]

type EventFiltersProps = {
  searchQuery: string
  setSearchQuery: (v: string) => void
  actionFilter: string
  setActionFilter: (v: string) => void
  agentFilter: string
  setAgentFilter: (v: string) => void
  availableAgents: string[]
  projectFilter: string
  setProjectFilter: (v: string) => void
  availableProjects: string[]
  sortOrder: string
  setSortOrder: (v: string) => void
  timeRange: string
  setTimeRange: (v: string) => void
  customStart: string
  setCustomStart: (v: string) => void
  customEnd: string
  setCustomEnd: (v: string) => void
  isLive?: boolean
  onToggleLive?: (live: boolean) => void
  onRefresh?: () => void
  histLoading?: boolean
  splitView?: boolean
  onToggleSplit?: () => void
  id?: string
  className?: string
}

export function EventFilters({
  searchQuery,
  setSearchQuery,
  actionFilter,
  setActionFilter,
  agentFilter,
  setAgentFilter,
  availableAgents,
  projectFilter,
  setProjectFilter,
  availableProjects,
  sortOrder,
  setSortOrder,
  timeRange,
  setTimeRange,
  customStart,
  setCustomStart,
  customEnd,
  setCustomEnd,
  isLive = true,
  onToggleLive,
  onRefresh,
  histLoading = false,
  splitView = false,
  onToggleSplit,
  id,
  className,
}: EventFiltersProps) {
  const [searchOpen, setSearchOpen] = useState(() => searchQuery !== '')
  const searchInputRef = useRef<HTMLInputElement>(null)

  const [filtersCollapsed, setFiltersCollapsed] = useState(() => {
    try {
      const stored = sessionStorage.getItem('events_filters_collapsed')
      return stored === null ? true : stored === '1'
    } catch {
      return true
    }
  })

  useEffect(() => {
    try {
      sessionStorage.setItem('events_filters_collapsed', filtersCollapsed ? '1' : '0')
    } catch {
      // non-fatal — collapse state just won't persist
    }
  }, [filtersCollapsed])

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])

  const hasActiveFilters =
    actionFilter !== 'all' ||
    agentFilter !== 'all' ||
    projectFilter !== 'all' ||
    sortOrder !== 'newest'

  return (
    <div
      id={id}
      className={cn(
        'flex flex-col gap-3 border-b border-[#333] bg-[#111] px-4 py-[10px] sm:flex-row sm:flex-wrap sm:items-center sm:justify-between',
        className
      )}
    >
      <div className="flex w-full min-w-0 max-w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:gap-5">
        <div className="flex w-full items-center gap-1.5 sm:w-auto">
          <Button
            variant="ghost"
            size="sm"
            aria-label={searchOpen ? 'Close events search' : 'Search events'}
            aria-expanded={searchOpen}
            onClick={() => {
              setSearchOpen((open) => {
                if (open) setSearchQuery('')
                return !open
              })
            }}
            className={cn(
              'h-7 shrink-0 px-2 text-[#666] hover:bg-white/[0.03] hover:text-[#cccccc]',
              searchOpen && 'text-[#cccccc]'
            )}
          >
            <Search className="size-3.5" />
          </Button>
          <Input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearchQuery('')
                setSearchOpen(false)
              }
            }}
            placeholder="Search events"
            aria-label="Search events"
            className={cn(
              'h-7 text-[0.8rem] bg-neutral-950 border-[#333] text-[#cccccc] placeholder:text-[#666] focus-visible:ring-0 transition-all duration-200',
              searchOpen
                ? 'w-full px-2 opacity-100 sm:w-[220px]'
                : 'pointer-events-none w-0 px-0 opacity-0'
            )}
            tabIndex={searchOpen ? 0 : -1}
          />
          <Button
            variant="ghost"
            size="sm"
            aria-label={filtersCollapsed ? 'Show filters' : 'Hide filters'}
            aria-expanded={!filtersCollapsed}
            onClick={() => setFiltersCollapsed((c) => !c)}
            className={cn(
              'relative h-7 shrink-0 px-2 text-[#666] hover:bg-white/[0.03] hover:text-[#cccccc]',
              !filtersCollapsed && 'text-[#cccccc]'
            )}
          >
            <ListFilter className="size-3.5" />
            {filtersCollapsed && hasActiveFilters && (
              <span
                data-testid="active-filters-dot"
                className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-green-500"
              />
            )}
          </Button>
        </div>

        {!filtersCollapsed && (
          <>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <span className="text-[0.7rem] text-[#666]">Event</span>
              <SearchableSelect
                value={actionFilter}
                onValueChange={setActionFilter}
                options={ACTION_OPTIONS}
                placeholder="All"
                ariaLabel="Filter by event"
                className="h-7 w-full px-2 text-[0.8rem] bg-neutral-950 border-[#333] text-[#cccccc] sm:w-[160px]"
              />
            </div>

            <div className="flex w-full items-center gap-2 sm:w-auto">
              <span className="text-[0.7rem] text-[#666]">Agent</span>
              <SearchableSelect
                value={agentFilter}
                onValueChange={setAgentFilter}
                options={[
                  { label: 'All', value: 'all' },
                  ...availableAgents.map((agent) => ({ label: agent, value: agent })),
                ]}
                placeholder="All"
                ariaLabel="Filter by agent"
                className="h-7 w-full px-2 text-[0.8rem] bg-neutral-950 border-[#333] text-[#cccccc] sm:w-[120px]"
              />
            </div>

            <div className="flex w-full items-center gap-2 sm:w-auto">
              <span className="text-[0.7rem] text-[#666]">Project</span>
              <SearchableSelect
                value={projectFilter}
                onValueChange={setProjectFilter}
                options={[
                  { label: 'All', value: 'all' },
                  ...availableProjects.map((cwd) => ({
                    label: cwd.split('/').filter(Boolean).pop() ?? cwd,
                    value: cwd,
                  })),
                ]}
                placeholder="All"
                ariaLabel="Filter by project"
                className="h-7 w-full px-2 text-[0.8rem] bg-neutral-950 border-[#333] text-[#cccccc] sm:w-[140px]"
              />
            </div>

            <div className="flex w-full items-center gap-2 sm:w-auto">
              <span className="text-[0.7rem] text-[#666]">Sort</span>
              <Select value={sortOrder} onValueChange={setSortOrder}>
                <SelectTrigger
                  size="sm"
                  className="w-full px-2 text-[0.8rem] bg-neutral-950 border-[#333] text-[#cccccc] sm:w-[110px] focus:ring-0 focus:ring-offset-0"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#111] border-[#333] text-[#cccccc]">
                  <SelectGroup>
                    <SelectItem value="newest">Newest</SelectItem>
                    <SelectItem value="oldest">Oldest</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div
              className={cn('flex items-center gap-3', isLive && 'pointer-events-none opacity-40')}
            >
              <div className="flex items-center gap-2">
                <span className="text-[0.7rem] text-[#666]">Time</span>
                <Select value={timeRange} onValueChange={setTimeRange} disabled={isLive}>
                  <SelectTrigger
                    size="sm"
                    className="w-full px-2 text-[0.8rem] bg-black border-[#333] text-[#cccccc] sm:w-[160px] focus:ring-0 focus:ring-offset-0"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#111] border-[#333] text-[#cccccc]">
                    <SelectGroup>
                      <SelectItem value="5m">Last 5 minutes</SelectItem>
                      <SelectItem value="15m">Last 15 minutes</SelectItem>
                      <SelectItem value="1h">Last 1 hour</SelectItem>
                      <SelectItem value="6h">Last 6 hours</SelectItem>
                      <SelectItem value="24h">Last 24 hours</SelectItem>
                      <SelectItem value="7d">Last 7 days</SelectItem>
                      <SelectItem value="30d">Last 30 days</SelectItem>
                      <SelectItem value="custom">Custom range</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              {timeRange === 'custom' && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-[0.7rem] uppercase text-[#666]">Start</span>
                    <Input
                      className="h-7 px-2 text-[0.8rem] bg-black border-[#333] text-[#cccccc] placeholder:text-[#666] focus-visible:ring-0 w-[160px]"
                      placeholder="2026-05-05 10:00:00"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      disabled={isLive}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[0.7rem] uppercase text-[#666]">End</span>
                    <Input
                      className="h-7 px-2 text-[0.8rem] bg-black border-[#333] text-[#cccccc] placeholder:text-[#666] focus-visible:ring-0 w-[160px]"
                      placeholder="2026-05-05 12:00:00"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      disabled={isLive}
                    />
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      <div className="hidden sm:flex sm:items-center sm:gap-1.5 shrink-0">
        {!isLive && onRefresh && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={histLoading}
            className="h-7 gap-1 px-2 text-[0.8rem] text-[#666] hover:text-[#cccccc]"
          >
            <RefreshCw className={`size-3 ${histLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        )}
        {onToggleLive && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onToggleLive(!isLive)}
            className={cn(
              'h-7 gap-1.5 px-2 text-[0.8rem] border-[#333] bg-black hover:bg-white/[0.03]',
              isLive
                ? 'border-green-700 text-green-400 hover:text-green-300'
                : 'text-[#666] hover:text-[#cccccc]'
            )}
          >
            <span
              className={`size-2 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-[#555]'}`}
            />
            Live
          </Button>
        )}
        {onToggleSplit && (
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleSplit}
            className={cn(
              'h-7 shrink-0 gap-1.5 px-2 text-[0.8rem] border-[#333] bg-black text-[#666] hover:bg-white/[0.03] hover:text-[#cccccc]',
              splitView && 'border-[#555] text-[#cccccc]'
            )}
            title={splitView ? 'Close split view' : 'Open split view'}
            aria-label={splitView ? 'Close split view' : 'Open split view'}
          >
            <Columns2 />
          </Button>
        )}
      </div>
    </div>
  )
}
