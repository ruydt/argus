import { useEffect, useMemo, useReducer } from 'react'
import { useNavigate } from 'react-router-dom'
import { json } from '@codemirror/lang-json'
import CodeMirror from '@uiw/react-codemirror'
import { Terminal } from 'lucide-react'
import { CopyIconButton } from '@/components/shared/CopyIconButton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { argusEditorTheme, argusHighlighting, readOnlyExtensions } from '@/lib/editorTheme'
import { SIM_PAYLOAD_HANDOFF_KEY } from '@/features/hooks-config/simHandoff'
import { PayloadFields } from './PayloadFields'

type PayloadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; value: unknown }
  | { status: 'error' }

async function fetchPayload(dedupKey: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(`/api/events/raw?key=${encodeURIComponent(dedupKey)}`, { signal })
  if (!res.ok) throw new Error(`${res.status}`)
  const data = (await res.json()) as { raw_payload: unknown }
  return data.raw_payload
}

type RawPayloadModalProps = {
  dedupKey: string
  label: string
  open: boolean
  onClose: () => void
}

export function RawPayloadModal({ dedupKey, label, open, onClose }: RawPayloadModalProps) {
  const navigate = useNavigate()
  const [payload, setPayload] = useReducer((_: PayloadState, next: PayloadState) => next, {
    status: 'idle',
  } as PayloadState)

  useEffect(() => {
    setPayload(open ? { status: 'loading' } : { status: 'idle' })
  }, [open, dedupKey])

  useEffect(() => {
    if (payload.status !== 'loading') return
    const controller = new AbortController()
    fetchPayload(dedupKey, controller.signal)
      .then((value) => setPayload({ status: 'ready', value }))
      .catch((err: unknown) => {
        if ((err as Error).name === 'AbortError') return
        console.error('[RawPayloadModal] fetch failed:', err)
        setPayload({ status: 'error' })
      })
    return () => controller.abort()
  }, [payload.status, dedupKey])

  const rawJson = useMemo(
    () => (payload.status === 'ready' ? JSON.stringify(payload.value, null, 2) : ''),
    [payload]
  )

  // The event name drives the simulator's event picker; it lives in the payload.
  const eventName = useMemo(() => {
    if (payload.status !== 'ready' || typeof payload.value !== 'object' || payload.value === null) {
      return ''
    }
    const ev = (payload.value as Record<string, unknown>).hook_event_name
    return typeof ev === 'string' ? ev : ''
  }, [payload])

  // Hand this exact payload + event to the simulator: stash the JSON, then deep
  // link to the Hooks page in simulator mode. The Hooks page reads + clears it.
  function simulate() {
    try {
      sessionStorage.setItem(SIM_PAYLOAD_HANDOFF_KEY, rawJson)
    } catch {
      /* sessionStorage unavailable — fall back to event-only deep link */
    }
    const params = new URLSearchParams({ view: 'simulator', payload: '1' })
    if (eventName) params.set('event', eventName)
    onClose()
    navigate(`/hooks?${params.toString()}`)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <DialogContent className="flex max-h-[80vh] w-[90vw] sm:max-w-4xl flex-col gap-3">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-6">
            <DialogTitle className="text-xs text-muted-foreground">{label}</DialogTitle>
            {payload.status === 'ready' && (
              <Button
                size="sm"
                variant="outline"
                onClick={simulate}
                className="h-7 shrink-0 gap-1.5 text-[12px]"
              >
                <Terminal className="size-3.5" />
                Simulate this event
              </Button>
            )}
          </div>
        </DialogHeader>
        {payload.status === 'loading' && <Skeleton className="h-64 w-full" aria-busy="true" />}
        {payload.status === 'error' && (
          <Alert variant="destructive">
            <AlertDescription>Failed to load raw payload.</AlertDescription>
          </Alert>
        )}
        {payload.status === 'ready' && (
          <Tabs defaultValue="fields" className="min-h-0 flex-1">
            <TabsList variant="line">
              <TabsTrigger value="fields">Fields</TabsTrigger>
              <TabsTrigger value="json">JSON</TabsTrigger>
            </TabsList>

            <TabsContent value="fields" className="min-h-0 flex-1 overflow-y-auto">
              <PayloadFields value={payload.value} />
            </TabsContent>

            <TabsContent value="json" className="flex min-h-0 flex-1 flex-col">
              <section
                className="relative flex min-h-0 flex-1 flex-col rounded-md border"
                aria-label="Raw payload JSON"
              >
                <CopyIconButton
                  text={rawJson}
                  label="JSON"
                  className="absolute top-2 right-2 z-10 size-7 text-muted-foreground hover:text-foreground hover:bg-foreground/10"
                />
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <CodeMirror
                    value={rawJson}
                    theme="none"
                    extensions={[
                      json(),
                      argusEditorTheme,
                      argusHighlighting,
                      ...readOnlyExtensions,
                    ]}
                    basicSetup={{
                      lineNumbers: false,
                      highlightActiveLine: true,
                      bracketMatching: true,
                      autocompletion: false,
                      foldGutter: false,
                    }}
                  />
                </div>
              </section>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}
