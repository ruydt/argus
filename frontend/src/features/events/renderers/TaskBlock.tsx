type TaskBlockProps = {
  title?: string
  description?: string
}

export function TaskBlock({ title, description }: TaskBlockProps) {
  if (!title) return null

  return (
    <div className="mt-2 text-[0.75rem] text-[#ccc] bg-black/30 border border-white/[0.05] px-3 py-2 rounded-[6px]">
      <strong className="text-[#aaa] text-[0.7rem]">{title}</strong>
      {description && (
        <pre className="mt-1 mb-0 whitespace-pre-wrap text-[0.73rem] text-[#888]">
          {description}
        </pre>
      )}
    </div>
  )
}
