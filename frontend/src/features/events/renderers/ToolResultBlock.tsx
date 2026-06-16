import type { ReactNode } from 'react'
import { highlight } from '@/lib/format'
import { CopyIconButton } from '@/components/shared/CopyIconButton'

type ToolResultBlockProps = {
  stdout?: string
  stderr?: string
  durationMs?: number
  searchQuery?: string
}

export function ToolResultBlock({
  stdout,
  stderr,
  durationMs,
  searchQuery = '',
}: ToolResultBlockProps) {
  if (!stdout && !stderr) return null

  return (
    <>
      {stdout && (
        <div
          className="group/eblock mt-2 overflow-hidden rounded-[6px] border border-black/[0.05] bg-black/[0.04] text-[0.75rem] select-text"
          data-event-drag-ignore
        >
          <div className="flex items-center justify-between px-3 py-1 border-b border-black/[0.05]">
            <div className="flex items-center gap-3">
              <strong className="text-[#666666] text-[0.7rem]">stdout</strong>
              {durationMs != null && durationMs > 0 && (
                <span className="text-[#666666] text-[0.65rem]">{durationMs}ms</span>
              )}
            </div>
            <CopyIconButton
              text={stdout}
              label="stdout"
              className="opacity-0 group-hover/eblock:opacity-100 focus-visible:opacity-100"
            />
          </div>
          <pre className="px-3 py-2 mb-0 whitespace-pre-wrap break-words text-[0.73rem] text-[#a0a0a0] max-h-[240px] overflow-y-auto font-[inherit]">
            {highlight(stdout, searchQuery) as ReactNode}
          </pre>
        </div>
      )}
      {stderr && (
        <div
          className="group/eblock mt-1 overflow-hidden rounded-[6px] border border-red-200 bg-red-50 text-[0.75rem] select-text"
          data-event-drag-ignore
        >
          <div className="flex items-center justify-between px-3 py-1 border-b border-red-200/20">
            <strong className="text-[#b91c1c] text-[0.7rem]">stderr</strong>
            <CopyIconButton
              text={stderr}
              label="stderr"
              className="opacity-0 group-hover/eblock:opacity-100 focus-visible:opacity-100"
            />
          </div>
          <pre className="px-3 py-2 mb-0 whitespace-pre-wrap break-words text-[0.73rem] text-[#b91c1c] max-h-[120px] overflow-y-auto font-[inherit]">
            {highlight(stderr, searchQuery) as ReactNode}
          </pre>
        </div>
      )}
    </>
  )
}
