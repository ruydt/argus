import type { ReactNode } from 'react'
import { highlight } from '@/lib/format'

type DisplayBlockProps = {
  message?: string
  searchQuery?: string
}

export function DisplayBlock({ message, searchQuery = '' }: DisplayBlockProps) {
  if (!message) return null

  return (
    <div className="mt-2 text-[0.75rem] text-[#171717] bg-black/[0.04] border border-black/[0.05] px-3 py-2 rounded-[6px]">
      <pre className="mt-0 mb-0 whitespace-pre-wrap text-[0.73rem] text-[#666666]">
        {highlight(message, searchQuery) as ReactNode}
      </pre>
    </div>
  )
}
