import type { DriveStep } from 'driver.js'

type DriverRef = { moveNext(): void }

export type PageTourOpts = {
  navigate: (path: string) => void
  getDriver: () => DriverRef | null
}

export type TourDefinition = DriveStep[] | ((opts: PageTourOpts) => DriveStep[])

function pollFor(selector: string, onFound: () => void, maxMs = 6000) {
  let elapsed = 0
  const id = setInterval(() => {
    elapsed += 100
    if (document.querySelector(selector) || elapsed >= maxMs) {
      clearInterval(id)
      onFound()
    }
  }, 100)
}

function buildEventsSteps(_opts: PageTourOpts): DriveStep[] {
  // Open filter panel now so all filter steps have elements in DOM
  const filterToggle = document.querySelector<HTMLButtonElement>(
    '[data-tour="events-filter-toggle"]'
  )
  if (filterToggle?.getAttribute('aria-expanded') === 'false') filterToggle.click()

  return [
    {
      element: '[data-tour="events-feed"]',
      popover: {
        title: 'Live event feed',
        description:
          'Hook payloads from your agent stream here in real time. Each row is one hook event — click to expand the full payload.',
      },
    },
    {
      element: '[data-tour="events-search-btn"]',
      popover: {
        title: 'Search',
        description:
          'Click to open a text search. Matches event type, tool name, file path, and payload content.',
      },
    },
    {
      element: '[data-tour="events-filter-toggle"]',
      popover: {
        title: 'Filter panel',
        description:
          'This toggle shows or hides the filter row. Filters are open now — the next steps walk through each one.',
      },
    },
    {
      element: '[data-tour="events-filter-event"]',
      popover: {
        title: 'Event type',
        description:
          'Filter to a specific hook — PreToolUse, PostToolUse, SessionStart, UserPromptSubmit, and more.',
      },
    },
    {
      element: '[data-tour="events-filter-agent"]',
      popover: {
        title: 'Agent',
        description: 'Show events from Claude Code, Codex, or all agents at once.',
      },
    },
    {
      element: '[data-tour="events-filter-project"]',
      popover: {
        title: 'Project',
        description: 'Limit the feed to events from a single working directory.',
      },
    },
    {
      element: '[data-tour="events-filter-sort"]',
      popover: {
        title: 'Sort order',
        description: 'Newest first (default) or oldest first.',
      },
    },
    {
      element: '[data-tour="events-filter-time"]',
      popover: {
        title: 'Time range',
        description:
          'Pick a window (last 5 min to 30 days) or a custom date range. Disabled while Live mode is on.',
      },
    },
    {
      element: '[data-tour="events-live-btn"]',
      popover: {
        title: 'Live mode',
        description:
          'Green pulse = new events stream in automatically. Click to pause and browse history freely.',
      },
    },
    {
      element: '[data-tour="events-split-btn"]',
      popover: {
        title: 'Split view',
        description:
          'Open a second panel to compare two sessions side by side. Drag any event row to the right edge to pin it there.',
      },
    },
  ]
}

function buildProjectsSteps({ navigate, getDriver }: PageTourOpts): DriveStep[] {
  const hasProjects = Boolean(document.querySelector('[data-tour="projects-first-card"]'))

  const searchStep: DriveStep = {
    element: '[data-tour="projects-search"]',
    popover: {
      title: 'Search projects',
      description: 'Type to filter by directory name or path. Results update as you type.',
    },
  }

  if (!hasProjects) {
    return [
      searchStep,
      {
        popover: {
          title: 'No projects yet',
          description:
            'Projects appear here as soon as your agent sends its first event. Start a Claude Code or Codex session and this page will populate automatically.',
          showButtons: ['next', 'previous'],
          doneBtnText: 'Done',
        },
      },
    ]
  }

  return [
    searchStep,
    {
      element: '[data-tour="projects-first-card"]',
      popover: {
        title: 'Project card',
        description:
          'Each card is a working directory your agent has run in. Shows session count, total tokens, and active agents. Click to see sessions.',
        onNextClick: () => {
          const card = document.querySelector<HTMLAnchorElement>(
            '[data-tour="projects-first-card"]'
          )
          const href = card?.getAttribute('href')
          if (href) navigate(href)
          pollFor('[data-tour="sessions-table"]', () => getDriver()?.moveNext())
        },
      },
    },
    {
      element: '[data-tour="sessions-table"]',
      popover: {
        title: 'Sessions',
        description:
          'Every agent session in this project — ID, agent type, duration, token usage, and timestamps. Click a row to inspect it.',
        showButtons: ['next', 'close'],
        onNextClick: () => {
          const row = document.querySelector<HTMLElement>('[data-tour="sessions-first-row"]')
          const href = row?.getAttribute('data-tour-navigate')
          if (href) navigate(href)
          pollFor('[data-tour="session-file-changes"]', () => getDriver()?.moveNext())
        },
      },
    },
    {
      element: '[data-tour="session-file-changes"]',
      popover: {
        title: 'File changes',
        description:
          'Every file your agent touched in this session, grouped by path with a git-style diff showing what changed.',
        showButtons: ['next', 'close'],
      },
    },
    {
      element: '[data-tour="session-view-events"]',
      popover: {
        title: 'View Events',
        description:
          'Jump to the full event stream for this session — every tool call, prompt, and output in sequence.',
        showButtons: ['next', 'close'],
      },
    },
  ]
}

const dashboardSteps: DriveStep[] = [
  {
    element: '[data-tour="dashboard-stats"]',
    popover: {
      title: 'Summary stats',
      description: 'Token usage, session count, and event totals across your selected date range.',
    },
  },
  {
    element: '[data-tour="dashboard-chart"]',
    popover: {
      title: 'Token timeline',
      description: 'Daily input/output token consumption. Hover a bar to see the breakdown.',
    },
  },
  {
    element: '[data-tour="dashboard-export"]',
    popover: {
      title: 'CSV export',
      description: 'Download session stats as CSV for further analysis in a spreadsheet.',
    },
  },
]

const hooksConfigSteps: DriveStep[] = [
  {
    element: '[data-tour="hooks-config-agent-tabs"]',
    popover: {
      title: 'Agent tabs',
      description:
        'Separate hook configs for Claude Code and Codex. Changes to one do not affect the other.',
    },
  },
  {
    element: '[data-tour="preset-selector"]',
    popover: {
      title: 'Presets',
      description:
        'Quickly load a curated hook set. Baseline is a great starting point; Full captures everything.',
    },
  },
  {
    element: '[aria-label="Save hooks config"]',
    popover: {
      title: 'Save',
      description:
        'Writes the config to disk. Your agent picks up changes on the next session start.',
    },
  },
]

const scriptsSteps: DriveStep[] = [
  {
    element: '[data-tour="scripts-tabs"]',
    popover: {
      title: 'Community vs. My Collection',
      description:
        'Community: curated scripts from the registry. My Collection: your installed scripts, optionally backed up to a private GitHub gist.',
    },
  },
  {
    element: '[data-tour="scripts-content"]',
    popover: {
      title: 'Script cards',
      description:
        'Each card shows the script name, event it targets, and runtime. Click Install to add it to ~/.argus/hooks/.',
    },
  },
]

const diagnosticsSteps: DriveStep[] = [
  {
    element: '[data-tour="diagnostics-tiles"]',
    popover: {
      title: 'Status overview',
      description:
        'Four at-a-glance tiles: readiness, uptime, hook request count, and agent warning count.',
    },
  },
  {
    element: '[data-tour="diagnostics-agent-connectivity"]',
    popover: {
      title: 'Agent Connectivity',
      description:
        'Per-agent status, last seen time, and hook config state. Degraded or stale here means events stopped arriving.',
    },
  },
  {
    element: '[data-tour="diagnostics-system-facts"]',
    popover: {
      title: 'System Facts',
      description:
        'Version, build info, DB path, size, WAL state, and migration version. Use Compact to reclaim disk space.',
    },
  },
  {
    element: '[data-tour="diagnostics-filesystem"]',
    popover: {
      title: 'File System',
      description:
        "Confirms argus can read your hooks config and transcript directories. Red here means hooks aren't being received.",
    },
  },
]

export const PAGE_TOURS: Record<string, TourDefinition> = {
  '/': buildEventsSteps,
  '/dashboard': dashboardSteps,
  '/projects': buildProjectsSteps,
  '/hooks-config': hooksConfigSteps,
  '/scripts': scriptsSteps,
  '/diagnostics': diagnosticsSteps,
}
