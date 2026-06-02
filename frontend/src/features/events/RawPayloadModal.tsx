import { useEffect, useState } from 'react'
import { json } from '@codemirror/lang-json'
import { EditorView } from '@codemirror/view'
import CodeMirror from '@uiw/react-codemirror'
import { Check, Copy } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { hookerEditorTheme, hookerHighlighting } from '@/lib/editorTheme'

type RawPayloadModalProps = {
  dedupKey: string
  label: string
  open: boolean
  onClose: () => void
}

export function RawPayloadModal({ dedupKey, label, open, onClose }: RawPayloadModalProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [rawJson, setRawJson] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) return
    setStatus('loading')
    setRawJson('')
    void fetch(`/api/events/raw?key=${encodeURIComponent(dedupKey)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`)
        const data = (await res.json()) as { raw_payload: unknown }
        setRawJson(JSON.stringify(data.raw_payload, null, 2))
        setStatus('ready')
      })
      .catch((err: unknown) => {
        console.error('[RawPayloadModal] fetch failed:', err)
        setStatus('error')
      })
  }, [open, dedupKey])

  function handleCopy() {
    void navigator.clipboard.writeText(rawJson).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="flex max-h-[80vh] max-w-3xl flex-col gap-3">
        <DialogHeader>
          <DialogTitle className="font-mono text-xs text-[#8b949e]">{label}</DialogTitle>
        </DialogHeader>
        {status === 'loading' && <Skeleton className="h-64 w-full" aria-busy="true" />}
        {status === 'error' && (
          <Alert variant="destructive">
            <AlertDescription>Failed to load raw payload.</AlertDescription>
          </Alert>
        )}
        {status === 'ready' && (
          <div className="relative rounded-md border overflow-hidden" role="region" aria-label="Raw payload JSON">
            <button
              onClick={handleCopy}
              className="absolute top-2 right-2 z-10 flex items-center justify-center size-7 rounded text-[#8b949e] hover:text-[#e6edf3] hover:bg-white/10 transition-colors"
              aria-label="Copy JSON"
              title="Copy JSON"
            >
              {copied ? <Check className="size-3.5 text-green-400" /> : <Copy className="size-3.5" />}
            </button>
            <CodeMirror
              value={rawJson}
              theme="none"
              extensions={[
                json(),
                hookerEditorTheme,
                hookerHighlighting,
                EditorView.lineWrapping,
                EditorView.editable.of(false),
              ]}
              basicSetup={{
                lineNumbers: true,
                highlightActiveLine: true,
                bracketMatching: true,
                autocompletion: false,
                foldGutter: true,
              }}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
