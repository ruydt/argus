import { useEffect, useState } from 'react'
import { json } from '@codemirror/lang-json'
import { EditorView } from '@codemirror/view'
import CodeMirror from '@uiw/react-codemirror'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { hookerEditorTheme, hookerHighlighting } from '@/lib/editorTheme'
import { CopyIconButton } from './renderers/CopyIconButton'

type RawPayloadModalProps = {
  dedupKey: string
  label: string
  open: boolean
  onClose: () => void
}

export function RawPayloadModal({ dedupKey, label, open, onClose }: RawPayloadModalProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [rawJson, setRawJson] = useState('')

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

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="flex max-h-[80vh] max-w-3xl flex-col gap-3">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="font-mono text-xs text-[#8b949e]">{label}</DialogTitle>
            {status === 'ready' && <CopyIconButton text={rawJson} label="raw payload" />}
          </div>
        </DialogHeader>
        {status === 'loading' && <Skeleton className="h-64 w-full" aria-busy="true" />}
        {status === 'error' && (
          <Alert variant="destructive">
            <AlertDescription>Failed to load raw payload.</AlertDescription>
          </Alert>
        )}
        {status === 'ready' && (
          <div className="overflow-auto rounded-md">
            <CodeMirror
              value={rawJson}
              extensions={[
                json(),
                hookerEditorTheme,
                hookerHighlighting,
                EditorView.lineWrapping,
                EditorView.editable.of(false),
              ]}
              basicSetup={false}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
