import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FolderKanban, Trash2 } from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import type { Project } from '@/types/sessions'

async function loadProjects(signal: AbortSignal): Promise<Project[]> {
  const res = await fetch('/api/projects', { signal })
  if (!res.ok) return []
  const data = (await res.json()) as { projects?: Project[] }
  return data.projects || []
}

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    loadProjects(controller.signal)
      .then(setProjects)
      .catch((err: unknown) => {
        if ((err as Error).name !== 'AbortError') setProjects([])
      })
    const interval = window.setInterval(() => {
      loadProjects(controller.signal)
        .then(setProjects)
        .catch(() => {})
    }, 10_000)
    return () => {
      controller.abort()
      window.clearInterval(interval)
    }
  }, [])

  async function handleDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/projects?cwd=${encodeURIComponent(pendingDelete.cwd)}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        const controller = new AbortController()
        setProjects(await loadProjects(controller.signal))
      }
    } finally {
      setDeleting(false)
      setPendingDelete(null)
    }
  }

  return (
    <div className="flex h-full flex-col bg-[#0a0a0a] text-white">
      <header className="border-b border-white/10 bg-black/40 px-6 py-4">
        <div className="text-[12px] font-semibold uppercase tracking-widest text-white/45">
          Projects
        </div>
        <h1 className="mt-1 text-xl font-semibold">Projects</h1>
      </header>

      <main className="flex-1 overflow-auto p-6">
        {projects === null ? (
          <div className="text-sm text-white/45">Loading projects…</div>
        ) : projects.length === 0 ? (
          <div className="text-sm text-white/55">
            No projects yet. Start a Claude Code or Codex session to see it here.
          </div>
        ) : (
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
        )}
      </main>

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
    </div>
  )
}
