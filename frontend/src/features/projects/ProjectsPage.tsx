import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FolderKanban, Search, Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { PageHeader, PageShell } from '@/components/shared/PageShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import type { Project } from '@/types/sessions'

const PAGE_SIZE = 20

export function ProjectsPage() {
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  // Debounce the input so each keystroke doesn't fire a DB query; the trimmed
  // value drives a server-side search (matches cwd/name in SQLite).
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(searchQuery.trim()), 300)
    return () => window.clearTimeout(id)
  }, [searchQuery])

  const fetchPage = useCallback(
    async (page: number) => {
      const params = new URLSearchParams({ page: String(page), size: String(PAGE_SIZE) })
      if (debouncedQuery) params.set('q', debouncedQuery)
      const res = await fetch(`/api/projects?${params.toString()}`)
      if (!res.ok) return { items: [] as Project[], hasMore: false }
      const data = (await res.json()) as { projects: Project[]; has_more: boolean }
      return { items: data.projects ?? [], hasMore: data.has_more ?? false }
    },
    [debouncedQuery]
  )

  // resetKey changes on a new search or after a delete → list resets to page 1.
  const resetKey = `${debouncedQuery}:${refreshKey}`
  const {
    items: projects,
    loading,
    loadingMore,
    sentinelRef,
  } = useInfiniteScroll<Project>(fetchPage, resetKey, PAGE_SIZE)

  async function handleDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/projects?cwd=${encodeURIComponent(pendingDelete.cwd)}`, {
        method: 'DELETE',
      })
      if (res.ok) setRefreshKey((k) => k + 1)
    } finally {
      setDeleting(false)
      setPendingDelete(null)
    }
  }

  return (
    <PageShell>
      <PageHeader title="Projects" />

      <div className="relative">
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search projects…"
          aria-label="Search projects"
          className="w-full border-white/10 bg-black/30 pl-9 text-[13px] placeholder:text-white/35"
        />
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/35" />
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[124px] rounded-lg" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="text-sm text-white/55">
          {debouncedQuery
            ? `No projects match “${debouncedQuery}”.`
            : 'No projects yet. Start a Claude Code or Codex session to see it here.'}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <Link
                key={project.cwd}
                to={`/sessions/${encodeURIComponent(project.cwd)}`}
                title={project.cwd}
                data-testid="project-card"
                className="group relative rounded-lg border border-white/10 bg-white/[0.035] p-4 transition-colors hover:border-white/20 hover:bg-white/[0.06]"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete project ${project.name}`}
                  className="absolute right-2 top-2 size-7 text-white/30 opacity-0 transition-opacity hover:bg-white/10 hover:text-red-400 focus-visible:opacity-100 group-hover:opacity-100"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setPendingDelete(project)
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>

                <div className="flex items-start gap-3">
                  <div className="rounded-md border border-white/10 bg-black/30 p-2 text-white/70">
                    <FolderKanban className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-[15px] font-semibold">{project.name}</h2>
                    </div>
                    <div className="mt-1 truncate text-[12px] text-white/45">{project.cwd}</div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 text-[12px] text-white/60">
                  <span>
                    {project.session_count} {project.session_count === 1 ? 'session' : 'sessions'}
                  </span>
                  <span>{Number(project.total_tokens ?? 0).toLocaleString()} tokens</span>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {project.agents.map((agent) => (
                    <span
                      key={agent}
                      className="rounded border border-white/10 bg-black/30 px-1.5 py-0.5 text-[11px] text-white/65"
                    >
                      {agent}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>

          {/* Sentinel + load-more indicator for infinite scroll. */}
          <div ref={sentinelRef} className="h-4" aria-hidden />
          {loadingMore ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-[124px] rounded-lg" />
              ))}
            </div>
          ) : null}
        </>
      )}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes {pendingDelete?.session_count}{' '}
              {pendingDelete?.session_count === 1 ? 'session' : 'sessions'} and all their events.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-500"
              disabled={deleting}
              onClick={() => void handleDelete()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  )
}
