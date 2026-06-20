import { Component, type ReactNode } from 'react'

type RouteErrorBoundaryProps = { children: ReactNode }
type RouteErrorBoundaryState = { error: Error | null }

// RouteErrorBoundary catches errors thrown while a lazy route loads or renders.
// Without it, a failed dynamic import — the classic "stale chunk after a new
// build is deployed" case — propagates past the route's <Suspense fallback>
// and unmounts the whole app, leaving a blank page. Here it shows an actionable
// message instead, keeping the surrounding shell intact.
export class RouteErrorBoundary extends Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  state: RouteErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('[argus] route failed to load', error)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const isStaleChunk =
      /loading chunk|dynamically imported module|failed to fetch|importing a module script/i.test(
        error.message
      )

    return (
      <div className="flex min-h-[60vh] flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-medium text-foreground">
          {isStaleChunk ? 'This page couldn’t load' : 'Something went wrong'}
        </p>
        <p className="max-w-md text-[13px] text-muted-foreground">
          {isStaleChunk
            ? 'Argus was updated since this tab opened. Reload to get the latest version.'
            : error.message}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md border border-border px-3 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-foreground/[0.04]"
        >
          Reload
        </button>
      </div>
    )
  }
}
