import type { ReactNode } from 'react'
import { highlight } from '@/lib/format'
import { CopyIconButton } from '@/components/shared/CopyIconButton'

type StopBlockProps = {
  response: string
  searchQuery?: string
}

export function StopBlock({ response, searchQuery = '' }: StopBlockProps) {
  if (!response) return null

  return (
    <div
      className="group/eblock mt-2 select-text rounded-[6px] border border-black/[0.05] bg-black/[0.04] px-3 py-2"
      data-event-drag-ignore
    >
      <div className="flex items-center justify-between gap-3">
        <strong className="text-[#666666] text-[0.7rem]">Response</strong>
        <CopyIconButton
          text={response}
          label="response"
          className="opacity-0 group-hover/eblock:opacity-100 focus-visible:opacity-100"
        />
      </div>
      <pre className="mt-1 mb-0 max-h-[400px] overflow-y-auto whitespace-pre-wrap break-words font-[inherit] text-[0.75rem] text-[#a0a0a0]">
        {highlight(response, searchQuery) as ReactNode}
      </pre>
    </div>
  )
}
