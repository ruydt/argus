import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import {
  type ArgusMeta,
  HOOK_EVENTS,
  RUNTIMES,
  injectMeta,
  parseArgusMeta,
  runtimeFromExt,
} from '../community/argusMeta'

type UploadFile = { name: string; body: string }

type UploadShareFormProps = {
  files: UploadFile[]
  onSubmit: (files: UploadFile[], description: string) => void
  onCancel: () => void
}

function initialMeta(f: UploadFile): ArgusMeta {
  const parsed = parseArgusMeta(f.body)
  return {
    title: parsed.title ?? '',
    event: parsed.event ?? '',
    runtime: parsed.runtime ?? runtimeFromExt(f.name),
    matcher: parsed.matcher ?? '',
    purpose: parsed.purpose ?? '',
  }
}

export function UploadShareForm({ files, onSubmit, onCancel }: UploadShareFormProps) {
  const [step, setStep] = useState(0)
  const [meta, setMeta] = useState<ArgusMeta[]>(() => files.map(initialMeta))
  const [description, setDescription] = useState('')

  const isDescriptionStep = step >= files.length
  const current = meta[step]

  function setField(field: keyof ArgusMeta, value: string) {
    setMeta((prev) => prev.map((m, i) => (i === step ? { ...m, [field]: value } : m)))
  }

  const requiredFilled = !!current && !!current.title && !!current.event && !!current.runtime

  function share() {
    const out = files.map((f, i) => ({ name: f.name, body: injectMeta(f.body, meta[i]) }))
    onSubmit(out, description)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-lg border border-white/15 bg-[#141414]">
        <DialogHeader>
          <DialogTitle>
            {isDescriptionStep
              ? 'Pull request description'
              : `File ${step + 1} of ${files.length} — ${files[step].name}`}
          </DialogTitle>
        </DialogHeader>

        {isDescriptionStep ? (
          <div className="space-y-3">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what these scripts do (optional)…"
              aria-label="Pull request description"
              className="h-32 w-full rounded-md border border-white/10 bg-[#0a0a0a] p-3 text-sm text-[#ddd]"
            />
            <div className="flex justify-between">
              <Button variant="outline" size="sm" onClick={() => setStep(files.length - 1)}>
                Back
              </Button>
              <Button size="sm" onClick={share}>
                Share
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <label className="block space-y-1">
              <span className="text-[0.72rem] text-[#999]">Title *</span>
              <Input
                value={current.title}
                onChange={(e) => setField('title', e.target.value)}
                placeholder="Short human title"
                aria-label="Title"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[0.72rem] text-[#999]">Event *</span>
              <Select value={current.event} onValueChange={(v) => setField('event', v)}>
                <SelectTrigger aria-label="Hook event">
                  <SelectValue placeholder="Select hook event" />
                </SelectTrigger>
                <SelectContent>
                  {HOOK_EVENTS.map((ev) => (
                    <SelectItem key={ev} value={ev}>
                      {ev}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="block space-y-1">
              <span className="text-[0.72rem] text-[#999]">Runtime *</span>
              <Select value={current.runtime} onValueChange={(v) => setField('runtime', v)}>
                <SelectTrigger aria-label="Runtime">
                  <SelectValue placeholder="Select runtime" />
                </SelectTrigger>
                <SelectContent>
                  {RUNTIMES.map((rt) => (
                    <SelectItem key={rt} value={rt}>
                      {rt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="block space-y-1">
              <span className="text-[0.72rem] text-[#999]">Matcher (optional)</span>
              <Input
                value={current.matcher}
                onChange={(e) => setField('matcher', e.target.value)}
                placeholder="e.g. Bash"
                aria-label="Matcher"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[0.72rem] text-[#999]">Purpose (optional)</span>
              <Input
                value={current.purpose}
                onChange={(e) => setField('purpose', e.target.value)}
                placeholder="One line describing what it does"
                aria-label="Purpose"
              />
            </label>
            <div className="flex justify-between">
              {step > 0 ? (
                <Button variant="outline" size="sm" onClick={() => setStep((s) => s - 1)}>
                  Back
                </Button>
              ) : (
                <span />
              )}
              <Button size="sm" disabled={!requiredFilled} onClick={() => setStep((s) => s + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
