import { useRef, useState, type ChangeEvent } from 'react'

import { Button } from '@/components/ui/button'

type UploadShareDialogProps = {
  onPublish: (files: { name: string; body: string }[]) => Promise<string>
  onNeedsLogin: () => void
  onResult: (notice: { text: string; href?: string }) => void
}

export function UploadShareDialog({ onPublish, onNeedsLogin, onResult }: UploadShareDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const list = e.target.files
    if (!list || list.length === 0) return
    setBusy(true)
    try {
      const files = await Promise.all(
        Array.from(list).map(async (f) => ({ name: f.name, body: await f.text() }))
      )
      const url = await onPublish(files)
      onResult({ text: `Opened a pull request with ${files.length} file(s).`, href: url })
    } catch (err) {
      const msg = (err as Error).message
      if (msg === 'unauthenticated' || msg === 'needs-scope') {
        onResult({ text: 'Sign in with GitHub (sharing permission) to publish.' })
        onNeedsLogin()
      } else {
        onResult({ text: 'Upload failed. Try again.' })
      }
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
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
    </>
  )
}
