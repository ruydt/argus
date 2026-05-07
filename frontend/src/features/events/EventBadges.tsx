import { Badge } from '@/components/ui/badge'
import { shortId } from '@/lib/format'
import type { EventRecord } from '@/types/events'

type EventBadgesProps = {
  event: EventRecord
}

export function EventBadges({ event: e }: EventBadgesProps) {
  const hasAny =
    e.tool ||
    e.source ||
    e.turn_id ||
    e.permission_mode ||
    e.subagent_type ||
    (e.subagent_id && e.action === 'AGENT') ||
    e.task_id ||
    e.notification_type ||
    e.change_type

  if (!hasAny) return null

  return (
    <div className="mt-[6px] text-[0.68rem] text-[#888] flex flex-wrap gap-[6px]">
      {e.tool && (
        <Badge
          variant="outline"
          className="text-[0.68rem] text-[#888] border-white/5 bg-white/[0.04] px-[6px] py-[2px] h-auto rounded"
        >
          <strong className="text-[#aaa] font-semibold mr-1">Tool:</strong> {e.tool}
        </Badge>
      )}
      {e.source && (
        <Badge
          variant="outline"
          className="text-[0.68rem] text-[#888] border-white/5 bg-white/[0.04] px-[6px] py-[2px] h-auto rounded"
        >
          <strong className="text-[#aaa] font-semibold mr-1">Source:</strong> {e.source}
        </Badge>
      )}
      {e.turn_id && (
        <Badge
          variant="outline"
          className="text-[0.68rem] text-[#888] border-white/5 bg-white/[0.04] px-[6px] py-[2px] h-auto rounded"
        >
          <strong className="text-[#aaa] font-semibold mr-1">Turn:</strong> {shortId(e.turn_id)}
        </Badge>
      )}
      {e.permission_mode && (
        <Badge
          variant="outline"
          className="text-[0.68rem] text-[#888] border-white/5 bg-white/[0.04] px-[6px] py-[2px] h-auto rounded"
        >
          <strong className="text-[#aaa] font-semibold mr-1">Mode:</strong> {e.permission_mode}
        </Badge>
      )}
      {e.subagent_type && (
        <Badge
          variant="outline"
          className="text-[0.68rem] text-[#888] border-white/5 bg-white/[0.04] px-[6px] py-[2px] h-auto rounded"
        >
          <strong className="text-[#aaa] font-semibold mr-1">Agent:</strong> {e.subagent_type}
        </Badge>
      )}
      {e.subagent_id && e.action === 'AGENT' && (
        <Badge
          variant="outline"
          className="text-[0.68rem] text-[#888] border-white/5 bg-white/[0.04] px-[6px] py-[2px] h-auto rounded"
        >
          <strong className="text-[#aaa] font-semibold mr-1">Agent ID:</strong>{' '}
          {shortId(e.subagent_id)}
        </Badge>
      )}
      {e.task_id && (
        <Badge
          variant="outline"
          className="text-[0.68rem] text-[#888] border-white/5 bg-white/[0.04] px-[6px] py-[2px] h-auto rounded"
        >
          <strong className="text-[#aaa] font-semibold mr-1">Task:</strong> {shortId(e.task_id)}
        </Badge>
      )}
      {e.notification_type && (
        <Badge
          variant="outline"
          className="text-[0.68rem] text-[#888] border-white/5 bg-white/[0.04] px-[6px] py-[2px] h-auto rounded"
        >
          <strong className="text-[#aaa] font-semibold mr-1">Notify:</strong> {e.notification_type}
        </Badge>
      )}
      {e.change_type && (
        <Badge
          variant="outline"
          className="text-[0.68rem] text-[#888] border-white/5 bg-white/[0.04] px-[6px] py-[2px] h-auto rounded"
        >
          <strong className="text-[#aaa] font-semibold mr-1">Change:</strong> {e.change_type}
        </Badge>
      )}
    </div>
  )
}
