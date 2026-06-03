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
    <div className="mt-2 text-[0.75rem] text-[#ccc] bg-black/30 border border-white/[0.05] px-3 py-2 rounded-[6px]">
      {serverName && <strong className="text-[#aaa] text-[0.7rem]">{serverName}</strong>}
      {prompt && (
        <pre className="mt-1 mb-0 whitespace-pre-wrap text-[0.73rem] text-[#888]">
          {highlight(prompt, searchQuery) as ReactNode}
        </pre>
      )}
      {response && (
        <pre className="mt-1 mb-0 whitespace-pre-wrap text-[0.73rem] text-[#47ff9c]">
          {highlight(response, searchQuery) as ReactNode}
        </pre>
      )}
    </div>
  )
}
