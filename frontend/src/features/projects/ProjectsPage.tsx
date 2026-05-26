import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FolderKanban } from 'lucide-react'
import type { Project } from '@/types/sessions'

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const fetchProjects = async () => {
      try {
        const res = await fetch('/api/projects')
        if (!res.ok) return
        const data = (await res.json()) as { projects?: Project[] }
        if (mounted) setProjects(data.projects || [])
      } finally {
        if (mounted) setLoading(false)
      }
    }

    fetchProjects()
    const interval = window.setInterval(fetchProjects, 10_000)
    return () => {
      mounted = false
      window.clearInterval(interval)
    }
  }, [])

  return (
    <div className="flex h-full flex-col bg-[#0a0a0a] text-white">
      <header className="border-b border-white/10 bg-black/40 px-6 py-4">
        <div className="text-[12px] font-semibold uppercase tracking-widest text-white/45">
          Projects
        </div>
        <h1 className="mt-1 text-xl font-semibold">Projects</h1>
      </header>

      <main className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="text-sm text-white/45">Loading projects...</div>
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
                className="rounded-lg border border-white/10 bg-white/[0.035] p-4 transition-colors hover:border-white/20 hover:bg-white/[0.06]"
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-md border border-white/10 bg-black/30 p-2 text-white/70">
                    <FolderKanban className="h-4 w-4" />
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
    </div>
  )
}
