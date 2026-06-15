import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { DeviceCodeResponse } from '@/types'

type DeviceFlowModalProps = {
  device: DeviceCodeResponse | null
  onClose: () => void
}

export function DeviceFlowModal({ device, onClose }: DeviceFlowModalProps) {
  const [copied, setCopied] = useState(false)

  if (!device) return null

  function handleCopy() {
    navigator.clipboard?.writeText(device!.user_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md border border-white/15 bg-[#141414] shadow-2xl">
        <DialogHeader>
          <DialogTitle>Connect GitHub</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <p className="text-[#aaa]">
            Open{' '}
            <a
              href={device.verification_uri}
              target="_blank"
              rel="noreferrer"
              className="text-[#863bff] underline"
            >
              {device.verification_uri}
            </a>{' '}
            and enter this code:
          </p>
          <div className="flex items-center justify-between rounded-md border border-white/10 bg-[#0a0a0a] px-4 py-3">
            <span className="font-mono text-lg tracking-[0.3em] text-[#e5e5e5]">
              {device.user_code}
            </span>
            <Button variant="outline" size="sm" onClick={handleCopy}>
              {copied ? (
                <Check className="size-3.5 text-green-400" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </Button>
          </div>
          <p className="text-xs text-[#777]">Waiting for authorization…</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
