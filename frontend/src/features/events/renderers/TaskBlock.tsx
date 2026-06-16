import type { ReactNode } from 'react'
import { highlight } from '@/lib/format'

type TaskBlockProps = {
  title?: string
  description?: string
  searchQuery?: string
}

export function TaskBlock({ title, description, searchQuery = '' }: TaskBlockProps) {
  if (!title) return null

  return (
    <div className="mt-2 text-[0.75rem] text-[#171717] bg-black/[0.04] border border-black/[0.05] px-3 py-2 rounded-[6px]">
      <strong className="text-[#666666] text-[0.7rem]">
        {highlight(title, searchQuery) as ReactNode}
      </strong>
      {description && (
        <pre className="mt-1 mb-0 whitespace-pre-wrap text-[0.73rem] text-[#666666]">
          {highlight(description, searchQuery) as ReactNode}
        </pre>
      )}
    </div>
  )
}
