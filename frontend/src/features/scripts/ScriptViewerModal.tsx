import { useEffect, useState } from 'react'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type ScriptViewerModalProps = {
  title: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Lazily fetch the script body when the modal opens. */
  load: () => Promise<string>
}

/** Full-screen-ish reader for a script's source, shared by both Scripts tabs. */
export function ScriptViewerModal({ title, open, onOpenChange, load }: ScriptViewerModalProps) {
  const [body, setBody] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setBody(null)
    setError(false)
    load()
      .then((b) => {
        if (!cancelled) setBody(b)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
    // load is recreated per render; re-running only on open is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl border border-white/15 bg-[#0d0d0d]">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm break-all">{title}</DialogTitle>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-muted-foreground">
            Source isn’t available locally for this script.
          </p>
        ) : body === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <pre className="max-h-[70vh] overflow-auto rounded-md bg-black/40 p-3 font-mono text-[0.72rem] leading-relaxed text-[#bbb]">
            {body}
          </pre>
        )}
      </DialogContent>
    </Dialog>
  )
}
