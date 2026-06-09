import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { cn } from '@/lib/utils'

type CopyIconButtonProps = {
  text: string
  label: string
  className?: string
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
}

export function CopyIconButton({ text, label, className, onClick }: CopyIconButtonProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const id = window.setTimeout(() => setCopied(false), 1200)
    return () => window.clearTimeout(id)
  }, [copied])

  const onCopy = async () => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        onClick?.(e)
        void onCopy()
      }}
      className={cn(
        'inline-flex h-5 w-5 items-center justify-center rounded text-[#8f8f8f] transition hover:bg-white/[0.08] hover:text-[#d0d0d0]',
        className
      )}
      aria-label={copied ? `Copied ${label}` : `Copy ${label}`}
      title={copied ? 'Copied' : 'Copy'}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  )
}
