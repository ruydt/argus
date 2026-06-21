import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { AgentLogo, agentMeta } from '@/agents/catalog'

type AgentLogosProps = {
  agents?: string[]
  className?: string
}

const MAX_SHOWN = 3

// AgentLogos renders the agents that can use a script as a tight row of slightly
// overlapping logos (no chrome). Each logo carries its own tooltip with the
// agent name; beyond MAX_SHOWN the remainder collapse into a "+N" badge whose
// tooltip names the rest.
export function AgentLogos({ agents, className }: AgentLogosProps) {
  const ids = agents ?? []
  if (ids.length === 0) return null
  const shown = ids.slice(0, MAX_SHOWN)
  const rest = ids.slice(MAX_SHOWN)

  return (
    <TooltipProvider delayDuration={100}>
      <span className={`flex items-center ${className ?? ''}`}>
        {shown.map((id, i) => (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <span style={{ zIndex: shown.length - i }} className="-ml-2 inline-flex first:ml-0">
                <AgentLogo id={id} size={18} />
              </span>
            </TooltipTrigger>
            <TooltipContent>{agentMeta(id).label}</TooltipContent>
          </Tooltip>
        ))}
        {rest.length > 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="-ml-2 inline-flex size-[18px] items-center justify-center rounded-full bg-foreground/[0.08] text-[0.6rem] font-medium text-muted-foreground">
                +{rest.length}
              </span>
            </TooltipTrigger>
            <TooltipContent>{rest.map((id) => agentMeta(id).label).join(', ')}</TooltipContent>
          </Tooltip>
        ) : null}
      </span>
    </TooltipProvider>
  )
}
