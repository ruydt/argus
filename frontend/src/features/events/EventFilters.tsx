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
}: EventFiltersProps) {
  return (
    <div className="flex gap-5 items-center px-4 py-[10px] bg-[#111] border-b border-[#333] flex-wrap">
      <div className="flex items-center gap-2">
        <span className="text-[0.7rem] uppercase text-[#666]">Action</span>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="h-auto py-1 px-2 text-[0.8rem] bg-black border-[#333] text-[#cccccc] w-[100px] focus:ring-0 focus:ring-offset-0">
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

      <div className="flex items-center gap-2 flex-1 min-w-[200px]">
        <span className="text-[0.7rem] uppercase text-[#666]">Search</span>
        <Input
          className="h-auto py-1 px-2 text-[0.8rem] bg-black border-[#333] text-[#cccccc] placeholder:text-[#666] focus-visible:ring-0 focus-visible:ring-offset-0"
          placeholder="Filter by path, prompt, or session ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[0.7rem] uppercase text-[#666]">Sort</span>
        <Select value={sortOrder} onValueChange={setSortOrder}>
          <SelectTrigger className="h-auto py-1 px-2 text-[0.8rem] bg-black border-[#333] text-[#cccccc] w-[110px] focus:ring-0 focus:ring-offset-0">
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

      <div className="flex items-center gap-2">
        <span className="text-[0.7rem] uppercase text-[#666]">Time</span>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="h-auto py-1 px-2 text-[0.8rem] bg-black border-[#333] text-[#cccccc] w-[160px] focus:ring-0 focus:ring-offset-0">
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
              className="h-auto py-1 px-2 text-[0.8rem] bg-black border-[#333] text-[#cccccc] placeholder:text-[#666] focus-visible:ring-0 w-[160px]"
              placeholder="2026-05-05 10:00:00"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[0.7rem] uppercase text-[#666]">End</span>
            <Input
              className="h-auto py-1 px-2 text-[0.8rem] bg-black border-[#333] text-[#cccccc] placeholder:text-[#666] focus-visible:ring-0 w-[160px]"
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
