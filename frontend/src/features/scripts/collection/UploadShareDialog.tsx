import { useRef, useState, type ChangeEvent } from 'react'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { UploadShareForm } from './UploadShareForm'

type UploadFile = { name: string; body: string }

type UploadShareDialogProps = {
  onPublish: (files: UploadFile[], description: string) => Promise<string>
  onNeedsLogin: () => void
  onResult: (notice: { text: string; href?: string }) => void
}

export function UploadShareDialog({ onPublish, onNeedsLogin, onResult }: UploadShareDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<UploadFile[] | null>(null)

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const list = e.target.files
    if (!list || list.length === 0) return
    const files = await Promise.all(
      Array.from(list).map(async (f) => ({ name: f.name, body: await f.text() }))
    )
    if (inputRef.current) inputRef.current.value = ''
    setPending(files)
  }

  async function submit(files: UploadFile[], description: string) {
    setPending(null)
    setBusy(true)
    try {
      const url = await onPublish(files, description)
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
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-1"
      >
        {busy ? (
          <>
            <Loader2 className="size-3 animate-spin" />
            Sharing…
          </>
        ) : (
          'Upload & share'
        )}
      </Button>
      {pending ? (
        <UploadShareForm files={pending} onSubmit={submit} onCancel={() => setPending(null)} />
      ) : null}
    </>
  )
}
