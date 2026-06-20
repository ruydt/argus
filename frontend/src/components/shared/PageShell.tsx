import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

type PageShellProps = {
  children: ReactNode
  /** Override the default 1200px content column (e.g. a narrower editor). */
  className?: string
}

/**
 * The single page frame for every top-level route: full-height scroll area,
 * centered 1200px column, and the shared responsive margins. Pair with
 * PageHeader so every page opens the same way.
 */
export function PageShell({ children, className }: PageShellProps) {
  return (
    <div className="flex-1 overflow-y-auto bg-background text-foreground">
      <div
        className={cn(
          'mx-auto flex max-w-[1200px] flex-col gap-6 px-4 pb-8 pt-10 sm:px-5 sm:pt-12 lg:px-6',
          className
        )}
      >
        {children}
      </div>
    </div>
  )
}

type PageHeaderProps = {
  title: string
  /** Optional secondary line under the title (e.g. a docs link). */
  subtitle?: ReactNode
  /** Right-aligned controls (date picker, refresh, save…). */
  actions?: ReactNode
  className?: string
}

/** The uniform page title row: 22px title left, optional actions right. */
export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <div className="flex flex-col gap-0.5">
        <h1 className="text-[28px] font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle ? <div>{subtitle}</div> : null}
      </div>
      {actions ? (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div>
      ) : null}
    </div>
  )
}
