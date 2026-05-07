import type { ReactNode } from 'react'
import { highlight } from '@/lib/format'

type CommandBlockProps = {
  prompt?: string
  command?: string
  path?: string
  searchQuery?: string
}

export function CommandBlock({ prompt, command, path, searchQuery = '' }: CommandBlockProps) {
  const label = prompt ? 'Prompt' : command ? 'Command' : path ? 'File' : 'Shell'

  return (
    <div className="mt-2 text-[0.75rem] text-[#ccc] bg-black/30 border border-white/[0.05] px-3 py-2 rounded-[6px]">
      <strong className="text-[#aaa] text-[0.7rem]">{label}</strong>
      {prompt ? (
        <pre className="mt-1 mb-0 max-h-[300px] overflow-y-auto whitespace-pre-wrap break-words font-[inherit] text-[0.75rem] text-[#a0a0a0]">
          {prompt}
        </pre>
      ) : (
        <pre className="mt-1 mb-0 whitespace-pre-wrap break-words text-[0.75rem] text-[#a0a0a0] max-h-[300px] overflow-y-auto font-[inherit]">
          {highlight(command || '', searchQuery) as ReactNode}
        </pre>
      )}
    </div>
  )
}
