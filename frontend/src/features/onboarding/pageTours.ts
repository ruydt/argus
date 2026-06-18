import type { DriveStep } from 'driver.js'

type DriverRef = { moveNext(): void }

export type PageTourOpts = {
  navigate: (path: string) => void
  getDriver: () => DriverRef | null
}

export type TourDefinition = DriveStep[] | ((opts: PageTourOpts) => DriveStep[])

// Radix Tabs activate on focus (automatic mode), not on a synthetic click event,
// so Element.click() alone won't switch a controlled tab. Focus first, then click.
function activateTab(selector: string) {
  const el = document.querySelector<HTMLElement>(selector)
  el?.focus()
  el?.click()
}

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

function buildEventsSteps(): DriveStep[] {
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

function buildHooksConfigSteps({ navigate, getDriver }: PageTourOpts): DriveStep[] {
  // Always begin from a clean Structured view: the tour may be launched while the
  // user is already in the Simulator, and stale ?view/?event params would make the
  // later "open simulator" navigation a no-op (no state change → tour stalls).
  document.querySelector<HTMLButtonElement>('[aria-label="Back to Structured"]')?.click()
  navigate('/hooks-config')

  const steps: DriveStep[] = [
    {
      element: '[data-tour="hooks-config-agent-tabs"]',
      popover: {
        title: 'Pick the agent',
        description:
          'Claude Code and Codex keep separate hook configs. Switch here — changes to one never touch the other.',
      },
    },
    {
      element: '[data-tour="hooks-structured-toolbar"]',
      popover: {
        title: 'Structured editor',
        description:
          'This is the Structured view — build your config visually instead of hand-editing JSON. Add a hook event from the left selector, or load a curated set with a preset.',
      },
    },
    {
      element: '[data-tour="preset-selector"]',
      popover: {
        title: 'Presets',
        description:
          'One-click hook sets. Baseline is a safe starting point; Full wires up every event. Applying a preset overwrites the current config.',
      },
    },
  ]

  // Only walk an event group when at least one is configured.
  if (document.querySelector('[data-tour="hooks-event-group"]')) {
    steps.push({
      element: '[data-tour="hooks-event-group"]',
      popover: {
        title: 'An event group',
        description:
          'Each configured event expands to its hook groups. A group has an optional matcher (which tool it fires on) and one or more commands. Edit a command inline, or open the ⋯ menu for timeout and extra options.',
      },
    })
  }

  steps.push({
    element: '[aria-label="Save hooks config"]',
    popover: {
      title: 'Save your changes',
      description:
        'Writes the config to disk. Your agent picks it up on the next session start. Next, let’s try the Simulator →',
    },
  })

  // Lead the user into the Simulator view. Deep-link with a sample event so the
  // command box + JSON editor render (they only mount once an event is chosen),
  // then guide through each once the view animates in.
  steps.push({
    element: '[aria-label="Open Simulator"]',
    popover: {
      title: 'Open the Simulator',
      description:
        'Before a live agent ever fires a hook, you can test it here. Click Next to step inside.',
      showButtons: ['previous', 'next', 'close'],
      onNextClick: () => {
        navigate('/hooks-config?view=simulator&event=PreToolUse')
        pollFor('[data-tour="sim-command"]', () => getDriver()?.moveNext())
      },
    },
  })

  steps.push({
    element: '[data-tour="sim-pickers"]',
    popover: {
      title: 'Choose what to test',
      description:
        'Pick the hook event to simulate on the left, then a script or preset command on the right.',
      showButtons: ['next', 'close'],
    },
  })

  steps.push({
    element: '[data-tour="sim-command"]',
    popover: {
      title: 'The command',
      description:
        'Picking a preset fills this in (e.g. CLAUDECODE=1 node …/hook.js) — or type any shell command yourself. This is exactly what runs, with the payload piped to it on stdin.',
      showButtons: ['previous', 'next', 'close'],
    },
  })

  steps.push({
    element: '[data-tour="sim-payload"]',
    popover: {
      title: 'The JSON payload',
      description:
        'A synthetic event body for the selected hook, pre-filled from a template. Edit it to match a real payload — this is the JSON your command receives on stdin.',
      showButtons: ['previous', 'next', 'close'],
    },
  })

  steps.push({
    popover: {
      title: 'Run it and read the result',
      description:
        'Hit Run to execute the command against your payload and inspect exit code, stdout, and stderr. Apply wires the command straight into your config. Use “Go back” (top-right) to return to the Structured editor.',
      showButtons: ['previous', 'next'],
      doneBtnText: 'Done',
    },
  })

  return steps
}

function buildScriptsSteps({ getDriver }: PageTourOpts): DriveStep[] {
  // Always start on the Community tab — the tour may be launched from My Collection,
  // and we want to begin from the beginning. No-op if already active.
  activateTab('[data-tour="scripts-tab-community"]')

  return [
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
        title: 'Community scripts',
        description:
          'Each card shows the script name, event it targets, and runtime. Click Install to add it to ~/.argus/hooks/.',
      },
    },
    {
      element: '[data-tour="scripts-tab-collection"]',
      popover: {
        title: 'My Collection',
        description:
          'Your own installed scripts live here. Click Next to switch over and take a look.',
        showButtons: ['previous', 'next', 'close'],
        onNextClick: () => {
          activateTab('[data-tour="scripts-tab-collection"]')
          pollFor('[data-tour="scripts-tab-collection"][data-state="active"]', () =>
            getDriver()?.moveNext()
          )
        },
      },
    },
    {
      element: '[data-tour="scripts-content"]',
      popover: {
        title: 'Your collection',
        description:
          'Scripts you’ve installed or saved. Sign in with GitHub to back them up to a private gist and sync across machines — or open one to view it.',
        showButtons: ['previous', 'next', 'close'],
      },
    },
    {
      // Highlight the first row's ⋯ menu when scripts exist; fall back to the
      // empty-state message when the collection is empty (driver picks the first
      // selector that matches).
      element: '[data-tour="collection-actions"], [data-tour="collection-empty"]',
      popover: {
        title: 'Row actions (⋯)',
        description:
          'Every script has a ⋯ menu: Test it in the Simulator, Show in folder, Save to gist (back it up), Install into ~/.argus/hooks/, or Remove it — from your machine, the gist, or both. Nothing here yet? Install one from the Community tab to get started.',
        showButtons: ['previous', 'next'],
        doneBtnText: 'Done',
      },
    },
  ]
}

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
]

export const PAGE_TOURS: Record<string, TourDefinition> = {
  '/': buildEventsSteps,
  '/hooks-config': buildHooksConfigSteps,
  '/scripts': buildScriptsSteps,
  '/diagnostics': diagnosticsSteps,
}
