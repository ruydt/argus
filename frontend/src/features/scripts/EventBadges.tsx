import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

type EventBadgesProps = {
  events?: string[]
  max?: number
}

// EventBadges renders a script's events as outline badges. Past `max`, the
// overflow collapses into a "+N" badge whose tooltip names the rest — keeps the
// column compact for scripts wired to many events. Renders nothing when empty
// (events come only from the script's own meta — never defaulted).
export function EventBadges({ events, max = 3 }: EventBadgesProps) {
  const list = events ?? []
  if (list.length === 0) return null
  const shown = list.slice(0, max)
  const rest = list.slice(max)

  return (
    <TooltipProvider delayDuration={100}>
      {shown.map((ev) => (
        <Badge key={ev} variant="outline">
          {ev}
        </Badge>
      ))}
      {rest.length > 0 ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="cursor-default">
              +{rest.length}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>{rest.join(', ')}</TooltipContent>
        </Tooltip>
      ) : null}
    </TooltipProvider>
  )
}
