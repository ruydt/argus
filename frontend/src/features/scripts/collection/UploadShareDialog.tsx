import { useRef, useState, type ChangeEvent } from 'react'

import { Button } from '@/components/ui/button'

type UploadShareDialogProps = {
  onPublish: (files: { name: string; body: string }[]) => Promise<string>
  onNeedsLogin: () => void
}

export function UploadShareDialog({ onPublish, onNeedsLogin }: UploadShareDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [prUrl, setPrUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const list = e.target.files
    if (!list || list.length === 0) return
    setBusy(true)
    setStatus(null)
    setPrUrl(null)
    try {
      const files = await Promise.all(
        Array.from(list).map(async (f) => ({ name: f.name, body: await f.text() }))
      )
      const url = await onPublish(files)
      setPrUrl(url)
      setStatus(`Opened a pull request with ${files.length} file(s).`)
    } catch (err) {
      const msg = (err as Error).message
      if (msg === 'unauthenticated' || msg === 'needs-scope') {
        setStatus('Sign in with GitHub (sharing permission) to publish.')
        onNeedsLogin()
      } else {
        setStatus('Upload failed. Try again.')
      }
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".js,.sh,.py"
        className="hidden"
        onChange={onPick}
        aria-label="Choose scripts to share"
      />
      <Button variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
        Upload & share
      </Button>
      {status ? (
        <span className="text-[0.72rem] text-[#999]">
          {status}
          {prUrl ? (
            <>
              {' '}
              <a
                className="text-foreground underline"
                href={prUrl}
                target="_blank"
                rel="noreferrer"
              >
                View PR
              </a>
            </>
          ) : null}
        </span>
      ) : null}
    </div>
  )
}
