import { Columns2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

type EventFiltersProps = {
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
  return (
    <div
      id={id}
      className={cn(
        'flex flex-col gap-3 border-b border-[#333] bg-[#111] px-4 py-[10px] sm:flex-row sm:flex-wrap sm:items-center sm:gap-5',
        className
      )}
    >
      {onToggleLive && (
        <ToggleGroup
          type="single"
          value={isLive ? 'live' : 'historical'}
          onValueChange={(v) => {
            if (v === 'live' || v === 'historical') onToggleLive(v === 'live')
          }}
          className="shrink-0"
        >
          <ToggleGroupItem value="live" className="gap-1.5 text-xs">
            <span
              className={`size-2 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground'}`}
            />
            Live
          </ToggleGroupItem>
          <ToggleGroupItem value="historical" className="text-xs">
            Historical
          </ToggleGroupItem>
        </ToggleGroup>
      )}

      <div className="flex w-full items-center gap-2 sm:w-auto">
        <span className="text-[0.7rem] text-[#666]">Action</span>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="h-auto w-full px-2 py-1 text-[0.8rem] bg-black border-[#333] text-[#cccccc] sm:w-[100px] focus:ring-0 focus:ring-offset-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#111] border-[#333] text-[#cccccc]">
            <SelectGroup>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="EDIT">EDIT</SelectItem>
              <SelectItem value="READ">READ</SelectItem>
              <SelectItem value="BASH">BASH</SelectItem>
              <SelectItem value="TOOL">TOOL</SelectItem>
              <SelectItem value="SESSION">SESSION</SelectItem>
              <SelectItem value="STOP">STOP</SelectItem>
              <SelectItem value="PROMPT">PROMPT</SelectItem>
              <SelectItem value="AGENT">AGENT</SelectItem>
              <SelectItem value="TASK">TASK</SelectItem>
              <SelectItem value="NOTIFY">NOTIFY</SelectItem>
              <SelectItem value="COMPACT">COMPACT</SelectItem>
              <SelectItem value="FILE">FILE</SelectItem>
              <SelectItem value="CONFIG">CONFIG</SelectItem>
              <SelectItem value="WORKTREE">WORKTREE</SelectItem>
              <SelectItem value="PERMISSION">PERMISSION</SelectItem>
              <SelectItem value="CWD">CWD</SelectItem>
              <SelectItem value="BATCH">BATCH</SelectItem>
              <SelectItem value="INSTRUCT">INSTRUCT</SelectItem>
              <SelectItem value="DISPLAY">DISPLAY</SelectItem>
              <SelectItem value="ELICIT">ELICIT</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {availableAgents.length > 0 && (
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <span className="text-[0.7rem] text-[#666]">Agent</span>
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="h-auto w-full px-2 py-1 text-[0.8rem] bg-black border-[#333] text-[#cccccc] sm:w-[120px] focus:ring-0 focus:ring-offset-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#111] border-[#333] text-[#cccccc]">
              <SelectGroup>
                <SelectItem value="all">All</SelectItem>
                {availableAgents.map((agent) => (
                  <SelectItem key={agent} value={agent}>
                    {agent}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      )}

      {availableProjects.length > 0 && (
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <span className="text-[0.7rem] text-[#666]">Project</span>
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="h-auto w-full px-2 py-1 text-[0.8rem] bg-black border-[#333] text-[#cccccc] sm:w-[140px] focus:ring-0 focus:ring-offset-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#111] border-[#333] text-[#cccccc]">
              <SelectGroup>
                <SelectItem value="all">All</SelectItem>
                {availableProjects.map((cwd) => (
                  <SelectItem key={cwd} value={cwd} title={cwd}>
                    {cwd.split('/').filter(Boolean).pop() ?? cwd}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex w-full items-center gap-2 sm:w-auto">
        <span className="text-[0.7rem] text-[#666]">Sort</span>
        <Select value={sortOrder} onValueChange={setSortOrder}>
          <SelectTrigger className="h-auto w-full px-2 py-1 text-[0.8rem] bg-black border-[#333] text-[#cccccc] sm:w-[110px] focus:ring-0 focus:ring-offset-0">
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

      <div className={isLive ? 'pointer-events-none opacity-40' : ''}>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <span className="text-[0.7rem] text-[#666]">Time</span>
          <Select value={timeRange} onValueChange={setTimeRange} disabled={isLive}>
            <SelectTrigger className="h-auto w-full px-2 py-1 text-[0.8rem] bg-black border-[#333] text-[#cccccc] sm:w-[160px] focus:ring-0 focus:ring-offset-0">
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
            <div className="flex w-full items-center gap-2 sm:w-auto mt-3">
              <span className="text-[0.7rem] uppercase text-[#666]">Start</span>
              <Input
                className="h-auto w-full px-2 py-1 text-[0.8rem] bg-black border-[#333] text-[#cccccc] placeholder:text-[#666] focus-visible:ring-0 sm:w-[160px]"
                placeholder="2026-05-05 10:00:00"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                disabled={isLive}
              />
            </div>
            <div className="flex w-full items-center gap-2 sm:w-auto mt-3">
              <span className="text-[0.7rem] uppercase text-[#666]">End</span>
              <Input
                className="h-auto w-full px-2 py-1 text-[0.8rem] bg-black border-[#333] text-[#cccccc] placeholder:text-[#666] focus-visible:ring-0 sm:w-[160px]"
                placeholder="2026-05-05 12:00:00"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                disabled={isLive}
              />
            </div>
          </>
        )}
      </div>

      {!isLive && onRefresh && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={histLoading}
          className="gap-1 shrink-0"
        >
          <RefreshCw className={`size-3 ${histLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      )}

      {onToggleSplit && (
        <Button
          variant="outline"
          size="sm"
          onClick={onToggleSplit}
          className={cn(
            'hidden sm:ml-auto sm:inline-flex h-auto shrink-0 gap-1.5 px-2 py-1 text-[0.8rem] border-[#333] bg-black text-[#666] hover:bg-white/[0.03] hover:text-[#cccccc]',
            splitView && 'border-[#555] text-[#cccccc]'
          )}
          title={splitView ? 'Close split view' : 'Open split view'}
          aria-label={splitView ? 'Close split view' : 'Open split view'}
        >
          <Columns2 />
        </Button>
      )}
    </div>
  )
}
