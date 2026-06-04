import { useEffect, useReducer, useState } from 'react'
import { json } from '@codemirror/lang-json'
import CodeMirror from '@uiw/react-codemirror'
import { Check, Copy } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { hookerEditorTheme, hookerHighlighting, readOnlyExtensions } from '@/lib/editorTheme'

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
  const [copied, setCopied] = useState(false)

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

  function handleCopy() {
    if (payload.status !== 'ready') return
    void navigator.clipboard.writeText(payload.rawJson).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
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
          <DialogTitle className="font-mono text-xs text-[#8b949e]">{label}</DialogTitle>
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
            <button
              type="button"
              onClick={handleCopy}
              className="absolute top-2 right-2 z-10 flex items-center justify-center size-7 rounded text-[#8b949e] hover:text-[#e6edf3] hover:bg-white/10 transition-colors"
              aria-label="Copy JSON"
              title="Copy JSON"
            >
              {copied ? (
                <Check className="size-3.5 text-green-400" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </button>
            <div className="overflow-y-auto flex-1 min-h-0">
              <CodeMirror
                value={payload.rawJson}
                theme="none"
                extensions={[json(), hookerEditorTheme, hookerHighlighting, ...readOnlyExtensions]}
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
