import { useEffect, useReducer } from 'react'
import { json } from '@codemirror/lang-json'
import CodeMirror from '@uiw/react-codemirror'
import { CopyIconButton } from '@/components/shared/CopyIconButton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { argusEditorTheme, argusHighlighting, readOnlyExtensions } from '@/lib/editorTheme'

type PayloadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; rawJson: string }
  | { status: 'error' }

async function fetchPayload(dedupKey: string, signal: AbortSignal): Promise<string> {
  const res = await fetch(`/api/events/raw?key=${encodeURIComponent(dedupKey)}`, { signal })
  if (!res.ok) throw new Error(`${res.status}`)
  const data = (await res.json()) as { raw_payload: unknown }
  return JSON.stringify(data.raw_payload, null, 2)
}

type RawPayloadModalProps = {
  dedupKey: string
  label: string
  open: boolean
  onClose: () => void
}

export function RawPayloadModal({ dedupKey, label, open, onClose }: RawPayloadModalProps) {
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
      .then((rawJson) => setPayload({ status: 'ready', rawJson }))
      .catch((err: unknown) => {
        if ((err as Error).name === 'AbortError') return
        console.error('[RawPayloadModal] fetch failed:', err)
        setPayload({ status: 'error' })
      })
    return () => controller.abort()
  }, [payload.status, dedupKey])

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <DialogContent className="flex max-h-[80vh] w-[90vw] sm:max-w-4xl flex-col gap-3">
        <DialogHeader>
          <DialogTitle className="text-xs text-muted-foreground">{label}</DialogTitle>
        </DialogHeader>
        {payload.status === 'loading' && <Skeleton className="h-64 w-full" aria-busy="true" />}
        {payload.status === 'error' && (
          <Alert variant="destructive">
            <AlertDescription>Failed to load raw payload.</AlertDescription>
          </Alert>
        )}
        {payload.status === 'ready' && (
          <section
            className="relative rounded-md border flex-1 min-h-0 flex flex-col"
            aria-label="Raw payload JSON"
          >
            <CopyIconButton
              text={payload.rawJson}
              label="JSON"
              className="absolute top-2 right-2 z-10 size-7 text-muted-foreground hover:text-foreground hover:bg-black/10"
            />
            <div className="overflow-y-auto flex-1 min-h-0">
              <CodeMirror
                value={payload.rawJson}
                theme="none"
                extensions={[json(), argusEditorTheme, argusHighlighting, ...readOnlyExtensions]}
                basicSetup={{
                  lineNumbers: true,
                  highlightActiveLine: true,
                  bracketMatching: true,
                  autocompletion: false,
                  foldGutter: true,
                }}
              />
            </div>
          </section>
        )}
      </DialogContent>
    </Dialog>
  )
}
