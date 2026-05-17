import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowRight, Check, Copy, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { buildEventKey } from '@/features/events/eventKey'
import type { TraceSpan } from './hooks/useTraces'

interface Props {
  span: TraceSpan | null
  onClose?: () => void
}

function JsonBlock({ title, data }: { title: string; data: unknown }) {
  const [copied, setCopied] = useState(false)
  const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2)

  if (!content) return null

  const handleCopy = () => {
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card
      size="sm"
      className="mb-6 w-full min-w-0 max-w-full border-white/10 bg-black/30 shadow-sm"
    >
      <CardHeader className="border-b border-white/10">
        <CardTitle className="text-[12px] font-medium text-white/80">{title}</CardTitle>
        <CardAction>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
            onClick={handleCopy}
          >
            {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
            Copy
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="w-full min-w-0 overflow-hidden p-0">
        <div className="overflow-x-auto [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb:hover]:bg-white/30">
          <pre
            className="w-max whitespace-pre p-4 font-mono text-[12px] leading-relaxed text-blue-100/80"
            style={{ fontFamily: '"Fira Code", "JetBrains Mono", monospace' }}
          >
            {content}
          </pre>
        </div>
      </CardContent>
    </Card>
  )
}

export function TraceInspectionPanel({ span, onClose }: Props) {
  const navigate = useNavigate()

  if (!span) {
    return (
      <div className="flex items-center justify-center h-full text-[#555] text-xs">
        Select a span to view details
      </div>
    )
  }

  const canSeeEvent = Boolean(span.event.session)

  const handleSeeEvent = () => {
    if (!span.event.session) return

    const params = new URLSearchParams({
      session: span.event.session,
      event: buildEventKey(span.event),
    })
    navigate({ pathname: '/', search: params.toString() })
  }

  return (
    <div className="flex w-full flex-col h-full overflow-hidden">
      <div className="flex w-full min-w-0 overflow-hidden items-center justify-between gap-3 border-b border-white/10 bg-black/20 px-5 py-3 shrink-0">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {span.type}
          </Badge>
          <span className="min-w-0 truncate text-[14px] font-semibold text-white">{span.name}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={handleSeeEvent}
            disabled={!canSeeEvent}
          >
            <ArrowRight data-icon="inline-end" />
            See Event
          </Button>
          {onClose && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              aria-label="Close details"
              onClick={onClose}
            >
              <X />
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="run" className="flex flex-col flex-1 min-h-0">
        <div className="px-5 border-b border-white/10 bg-black/20">
          <TabsList variant="line" className="h-11 gap-6 p-0">
            <TabsTrigger
              value="run"
              className="h-11 px-1 text-[13px] font-medium text-white/50 data-active:text-white"
            >
              Run
            </TabsTrigger>
            <TabsTrigger
              value="metadata"
              className="h-11 px-1 text-[13px] font-medium text-white/50 data-active:text-white"
            >
              Metadata
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden w-full [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb:hover]:bg-white/30">
          <div className="w-full overflow-x-hidden p-5">
            <TabsContent value="run" className="m-0 focus-visible:outline-none">
              <div className="mb-8 grid w-full overflow-hidden gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-[12px] text-white/60 shadow-sm">
                <div className="flex w-full flex-col overflow-hidden">
                  <span className="text-[10px] uppercase tracking-wider text-white/40">Run ID</span>
                  <div className="mt-0.5 w-full overflow-x-auto [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb:hover]:bg-white/30">
                    <span className="block min-w-max w-max break-all font-mono text-white/90">
                      {span.id}
                    </span>
                  </div>
                </div>
                <Separator orientation="horizontal" className="w-full" />
                <div className="flex w-full flex-col">
                  <span className="text-[10px] uppercase tracking-wider text-white/40">
                    Duration
                  </span>
                  <span className="text-white/90 mt-0.5">{span.duration}ms</span>
                </div>
              </div>

              {span.event.prompt && <JsonBlock title="Input (Prompt)" data={span.event.prompt} />}
              {span.event.tool_calls_json && (
                <JsonBlock title="Input (Tool Calls)" data={span.event.tool_calls_json} />
              )}
              {!span.event.prompt && !span.event.tool_calls_json && (
                <JsonBlock title="Raw Payload" data={span.event} />
              )}

              {span.event.response && (
                <JsonBlock title="Output (Response)" data={span.event.response} />
              )}
              {span.event.tool_result_stdout && (
                <JsonBlock title="Output (Stdout)" data={span.event.tool_result_stdout} />
              )}
              {span.event.tool_result_stderr && (
                <JsonBlock title="Output (Stderr)" data={span.event.tool_result_stderr} />
              )}
            </TabsContent>

            <TabsContent value="metadata" className="m-0 focus-visible:outline-none min-w-0">
              <JsonBlock
                title="Metadata"
                data={{
                  agent: span.event.agent,
                  session_id: span.event.session,
                  hook_event_name: span.event.hook_event_name,
                  model: span.event.model,
                  source: span.event.source,
                  turn_id: span.event.turn_id,
                  task_id: span.event.task_id,
                }}
              />
            </TabsContent>
          </div>
        </div>
      </Tabs>
    </div>
  )
}
