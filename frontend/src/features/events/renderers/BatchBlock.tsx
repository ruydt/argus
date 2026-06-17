type BatchCall = {
  tool_name: string
  tool_input: {
    file_path?: string
    command?: string
  }
}

type BatchBlockProps = {
  json?: string
}

export function BatchBlock({ json }: BatchBlockProps) {
  if (!json) return null

  const calls = (() => {
    try {
      return JSON.parse(json) as BatchCall[]
    } catch {
      return null
    }
  })()

  if (!calls) return null

  return (
    <div className="mt-2 flex flex-col gap-[3px]">
      {calls.map((c, ci) => (
        <div
          key={`${c.tool_name}-${c.tool_input?.file_path || c.tool_input?.command || ci}`}
          className="flex gap-2 text-[0.72rem] text-muted-foreground"
        >
          <span className="text-muted-foreground font-bold shrink-0">[{c.tool_name}]</span>
          <span className="break-all text-muted-foreground">
            {c.tool_input?.file_path || c.tool_input?.command || ''}
          </span>
        </div>
      ))}
    </div>
  )
}
