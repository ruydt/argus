type ToolResultBlockProps = {
  stdout?: string
  stderr?: string
  durationMs?: number
}

export function ToolResultBlock({ stdout, stderr, durationMs }: ToolResultBlockProps) {
  if (!stdout && !stderr) return null

  return (
    <>
      {stdout && (
        <div className="mt-2 text-[0.75rem] bg-black/40 border border-white/[0.05] rounded-[6px] overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1 border-b border-white/[0.05]">
            <strong className="text-[#aaa] text-[0.7rem]">stdout</strong>
            {durationMs != null && durationMs > 0 && (
              <span className="text-[#555] text-[0.65rem]">{durationMs}ms</span>
            )}
          </div>
          <pre className="px-3 py-2 mb-0 whitespace-pre-wrap break-words text-[0.73rem] text-[#a0a0a0] max-h-[240px] overflow-y-auto font-[inherit]">
            {stdout}
          </pre>
        </div>
      )}
      {stderr && (
        <div className="mt-1 text-[0.75rem] bg-red-950/20 border border-red-900/30 rounded-[6px] overflow-hidden">
          <div className="px-3 py-1 border-b border-red-900/20">
            <strong className="text-[#ff9999] text-[0.7rem]">stderr</strong>
          </div>
          <pre className="px-3 py-2 mb-0 whitespace-pre-wrap break-words text-[0.73rem] text-[#ff9999] max-h-[120px] overflow-y-auto font-[inherit]">
            {stderr}
          </pre>
        </div>
      )}
    </>
  )
}
