import type { ReactNode } from 'react'
import { highlight } from '@/lib/format'

type ElicitBlockProps = {
  serverName?: string
  prompt?: string
  response?: string
  searchQuery?: string
}

export function ElicitBlock({ serverName, prompt, response, searchQuery = '' }: ElicitBlockProps) {
  if (!serverName && !prompt) return null

  return (
    <div className="mt-2 text-[0.75rem] text-[#171717] bg-black/[0.04] border border-black/[0.05] px-3 py-2 rounded-[6px]">
      {serverName && <strong className="text-[#666666] text-[0.7rem]">{serverName}</strong>}
      {prompt && (
        <pre className="mt-1 mb-0 whitespace-pre-wrap text-[0.73rem] text-[#666666]">
          {highlight(prompt, searchQuery) as ReactNode}
        </pre>
      )}
      {response && (
        <pre className="mt-1 mb-0 whitespace-pre-wrap text-[0.73rem] text-[#16a34a]">
          {highlight(response, searchQuery) as ReactNode}
        </pre>
      )}
    </div>
  )
}
