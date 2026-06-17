type WorktreeBlockProps = {
  branch?: string
  hookEventName?: string
}

export function WorktreeBlock({ branch, hookEventName }: WorktreeBlockProps) {
  if (!branch) return null

  const isCreate = hookEventName === 'WorktreeCreate'

  return (
    <div className="mt-1 text-[0.72rem] text-muted-foreground">
      <span className="text-muted-foreground mr-1">branch</span>
      <span className={isCreate ? 'text-[#16a34a]' : 'text-[#dc2626]'}>{branch}</span>
    </div>
  )
}
