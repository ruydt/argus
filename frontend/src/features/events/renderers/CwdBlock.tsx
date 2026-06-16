type CwdBlockProps = {
  oldCwd?: string
  newCwd?: string
}

export function CwdBlock({ oldCwd, newCwd }: CwdBlockProps) {
  if (!oldCwd && !newCwd) return null

  return (
    <div className="mt-1 text-[0.72rem] text-[#666666]">
      {oldCwd && <span className="text-[#dc2626]">{oldCwd}</span>}
      {oldCwd && newCwd && <span className="mx-2 text-[#666666]">→</span>}
      {newCwd && <span className="text-[#16a34a]">{newCwd}</span>}
    </div>
  )
}
