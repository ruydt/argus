import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type EventFiltersProps = {
  actionFilter: string
  setActionFilter: (v: string) => void
  searchQuery: string
  setSearchQuery: (v: string) => void
  sortOrder: string
  setSortOrder: (v: string) => void
  timeRange: string
  setTimeRange: (v: string) => void
  customStart: string
  setCustomStart: (v: string) => void
  customEnd: string
  setCustomEnd: (v: string) => void
  id?: string
  className?: string
}

export function EventFilters({
  actionFilter,
  setActionFilter,
  searchQuery,
  setSearchQuery,
  sortOrder,
  setSortOrder,
  timeRange,
  setTimeRange,
  customStart,
  setCustomStart,
  customEnd,
  setCustomEnd,
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
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <span className="text-[0.7rem] uppercase text-[#666]">Action</span>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="h-auto w-full px-2 py-1 text-[0.8rem] bg-black border-[#333] text-[#cccccc] sm:w-[100px] focus:ring-0 focus:ring-offset-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#111] border-[#333] text-[#cccccc]">
            <SelectGroup>
              <SelectItem value="all">ALL</SelectItem>
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
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="flex w-full min-w-0 items-center gap-2 sm:min-w-[220px] sm:flex-1">
        <span className="text-[0.7rem] uppercase text-[#666]">Search</span>
        <Input
          className="h-auto w-full px-2 py-1 text-[0.8rem] bg-black border-[#333] text-[#cccccc] placeholder:text-[#666] focus-visible:ring-0 focus-visible:ring-offset-0"
          placeholder="Filter by path, prompt, or session ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="flex w-full items-center gap-2 sm:w-auto">
        <span className="text-[0.7rem] uppercase text-[#666]">Sort</span>
        <Select value={sortOrder} onValueChange={setSortOrder}>
          <SelectTrigger className="h-auto w-full px-2 py-1 text-[0.8rem] bg-black border-[#333] text-[#cccccc] sm:w-[110px] focus:ring-0 focus:ring-offset-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#111] border-[#333] text-[#cccccc]">
            <SelectGroup>
              <SelectItem value="newest">NEWEST</SelectItem>
              <SelectItem value="oldest">OLDEST</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="flex w-full items-center gap-2 sm:w-auto">
        <span className="text-[0.7rem] uppercase text-[#666]">Time</span>
        <Select value={timeRange} onValueChange={setTimeRange}>
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
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <span className="text-[0.7rem] uppercase text-[#666]">Start</span>
            <Input
              className="h-auto w-full px-2 py-1 text-[0.8rem] bg-black border-[#333] text-[#cccccc] placeholder:text-[#666] focus-visible:ring-0 sm:w-[160px]"
              placeholder="2026-05-05 10:00:00"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
            />
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <span className="text-[0.7rem] uppercase text-[#666]">End</span>
            <Input
              className="h-auto w-full px-2 py-1 text-[0.8rem] bg-black border-[#333] text-[#cccccc] placeholder:text-[#666] focus-visible:ring-0 sm:w-[160px]"
              placeholder="2026-05-05 12:00:00"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
            />
          </div>
        </>
      )}
    </div>
  )
}
