type PaginationBarProps = {
  page: number
  totalPages: number
  pageSize: number
  totalItems: number
  rangeStart: number
  rangeEnd: number
  defaultPageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

export function PaginationBar({
  page,
  totalPages,
  pageSize,
  totalItems,
  rangeStart,
  rangeEnd,
  defaultPageSize,
  onPageChange,
  onPageSizeChange,
}: PaginationBarProps) {
  return (
    <div className="flex items-center justify-between px-3 py-[6px] border-b border-foreground/[0.08] bg-foreground/[0.04] text-[0.72rem] text-muted-foreground">
      <div className="flex items-center gap-2">
        <span>
          {rangeStart + 1}–{rangeEnd} of {totalItems}
        </span>
        <span className="text-muted-foreground">·</span>
        <label className="flex items-center gap-1">
          <span className="text-muted-foreground">per page</span>
          <input
            type="number"
            min={10}
            max={10000}
            value={pageSize}
            onChange={(e) => {
              const v = Math.max(10, Math.min(10000, Number(e.target.value) || defaultPageSize))
              onPageSizeChange(v)
              onPageChange(0)
            }}
            className="w-[60px] bg-muted border border-foreground/[0.08] rounded px-1.5 py-0.5 text-[0.72rem] text-foreground text-center focus:outline-none focus:border-foreground/20"
          />
        </label>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 0}
          onClick={() => onPageChange(0)}
          className="px-1.5 py-0.5 rounded hover:bg-foreground/[0.06] disabled:opacity-30 disabled:cursor-default"
        >
          ««
        </button>
        <button
          type="button"
          disabled={page <= 0}
          onClick={() => onPageChange(page - 1)}
          className="px-1.5 py-0.5 rounded hover:bg-foreground/[0.06] disabled:opacity-30 disabled:cursor-default"
        >
          «
        </button>
        <span className="px-2 text-foreground">
          {page + 1} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(page + 1)}
          className="px-1.5 py-0.5 rounded hover:bg-foreground/[0.06] disabled:opacity-30 disabled:cursor-default"
        >
          »
        </button>
        <button
          type="button"
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(totalPages - 1)}
          className="px-1.5 py-0.5 rounded hover:bg-foreground/[0.06] disabled:opacity-30 disabled:cursor-default"
        >
          »»
        </button>
      </div>
    </div>
  )
}
