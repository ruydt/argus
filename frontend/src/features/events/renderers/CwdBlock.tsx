type CwdBlockProps = {
  oldCwd?: string
  newCwd?: string
}

export function CwdBlock({ oldCwd, newCwd }: CwdBlockProps) {
  if (!oldCwd && !newCwd) return null

  return (
    <div className="mt-1 text-[0.72rem] text-[#888]">
      {oldCwd && <span className="text-[#ff6b6b]">{oldCwd}</span>}
      {oldCwd && newCwd && <span className="mx-2 text-[#666]">→</span>}
      {newCwd && <span className="text-[#47ff9c]">{newCwd}</span>}
    </div>
  )
}
