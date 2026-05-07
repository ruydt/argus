type StopBlockProps = {
  response: string
}

export function StopBlock({ response }: StopBlockProps) {
  if (!response) return null

  return (
    <div className="mt-2 bg-black/30 border border-white/[0.05] px-3 py-2 rounded-[6px]">
      <strong className="text-[#aaa] text-[0.7rem]">Response</strong>
      <pre className="mt-1 mb-0 max-h-[400px] overflow-y-auto whitespace-pre-wrap break-words font-[inherit] text-[0.75rem] text-[#a0a0a0]">
        {response}
      </pre>
    </div>
  )
}
