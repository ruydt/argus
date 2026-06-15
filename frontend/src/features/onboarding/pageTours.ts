import type { DriveStep } from 'driver.js'

const eventsSteps: DriveStep[] = [
  {
    element: '[data-tour="events-feed"]',
    popover: {
      title: 'Live event feed',
      description:
        'Hook payloads from your agent stream here in real time. Each row is one hook event.',
    },
  },
  {
    element: '#event-filters',
    popover: {
      title: 'Filter events',
      description:
        'Filter by event type, session, project, or search text. Filters combine as AND.',
    },
  },
]

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

const projectsSteps: DriveStep[] = [
  {
    element: '[data-tour="projects-grid"]',
    popover: {
      title: 'Projects',
      description:
        'Each card is a working directory your agent has run in. Click a card to see its sessions.',
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
    element: '[data-tour="diagnostics-health"]',
    popover: {
      title: 'Health',
      description: 'Database path, total event count, and disk usage at a glance.',
    },
  },
  {
    element: '[data-tour="diagnostics-filesystem"]',
    popover: {
      title: 'File system',
      description:
        "Confirms argus can read your hooks config and transcript directories. Red here means hooks aren't being received.",
    },
  },
]

export const PAGE_TOURS: Record<string, DriveStep[]> = {
  '/': eventsSteps,
  '/dashboard': dashboardSteps,
  '/projects': projectsSteps,
  '/hooks-config': hooksConfigSteps,
  '/scripts': scriptsSteps,
  '/diagnostics': diagnosticsSteps,
}
