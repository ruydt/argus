import type { ReactNode } from 'react'
import { highlight } from '@/lib/format'
import { CopyIconButton } from '@/components/shared/CopyIconButton'

type CommandBlockProps = {
  prompt?: string
  command?: string
  path?: string
  description?: string
  searchQuery?: string
}

export function CommandBlock({
  prompt,
  command,
  path,
  description,
  searchQuery = '',
}: CommandBlockProps) {
  const label = prompt ? 'Prompt' : command ? 'Command' : path ? 'File' : 'Shell'
  const textToCopy = prompt || command || path || ''

  return (
    <div
      className="group/eblock mt-2 select-text rounded-[6px] border border-black/[0.05] bg-black/[0.04] px-3 py-2 text-[0.75rem] text-[#171717]"
      data-event-drag-ignore
    >
      <div className="flex items-center justify-between gap-3">
        <strong className="text-[#666666] text-[0.7rem]">{label}</strong>
        <CopyIconButton
          text={textToCopy}
          label={label.toLowerCase()}
          className="opacity-0 group-hover/eblock:opacity-100 focus-visible:opacity-100"
        />
      </div>
      {prompt ? (
        <pre className="mt-1 mb-0 max-h-[300px] overflow-y-auto whitespace-pre-wrap break-words font-[inherit] text-[0.75rem] text-[#a0a0a0]">
          {highlight(prompt, searchQuery) as ReactNode}
        </pre>
      ) : (
        <pre className="mt-1 mb-0 whitespace-pre-wrap break-words text-[0.75rem] text-[#a0a0a0] max-h-[300px] overflow-y-auto font-[inherit]">
          {highlight(command || '', searchQuery) as ReactNode}
        </pre>
      )}
      {description && (
        <p className="mt-1 mb-0 text-[0.7rem] text-[#777]">
          <span className="text-[#666666]">Intent:</span> {description}
        </p>
      )}
    </div>
  )
}
