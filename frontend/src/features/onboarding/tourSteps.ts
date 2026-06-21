import type { DriveStep } from 'driver.js'

type TourDriver = {
  moveNext: () => void
  moveTo: (index: number) => void
  destroy: () => void
}

type FirstVisitStepsOptions = {
  navigate: (path: string) => void
  getDriver: () => TourDriver | null
  onComplete: () => void
  // Best-effort install state pulled from /api/agents. agentsLoaded guards
  // against a slow/failed fetch: when not yet loaded we assume an agent is
  // present and follow the normal flow rather than wrongly showing "no agent".
  getInstalledAgents: () => string[]
  getAgentsLoaded: () => boolean
}

// Step indices the branch logic jumps between — keep in sync with the array order.
const PRESET_STEP = 2
const NO_AGENT_STEP = 5

export function buildFirstVisitSteps({
  navigate,
  getDriver,
  onComplete,
  getInstalledAgents,
  getAgentsLoaded,
}: FirstVisitStepsOptions): DriveStep[] {
  const finish = () => {
    onComplete()
    navigate('/')
    getDriver()?.destroy()
  }

  return [
    {
      element: '[data-tour="sidebar-nav"]',
      popover: {
        title: 'Welcome to Argus',
        description:
          "Your hook control center for AI coding agents. Let's get you set up in 60 seconds.",
      },
    },
    {
      element: '[data-tour="hooks-config-link"]',
      popover: {
        title: 'Configure your hooks',
        description: 'First, wire up your agent. Click <strong>Next</strong> to open Hooks.',
        onNextClick: () => {
          navigate('/hooks')
          // Poll until the Hooks page has rendered (it's lazy-loaded), then
          // branch: no installed agent → jump to the "install an agent" step;
          // otherwise continue to the preset step.
          const interval = setInterval(() => {
            const ready =
              document.querySelector('[data-tour="preset-selector"]') ||
              document.querySelector('[data-tour="hooks-config-agent-tabs"]')
            if (!ready) return
            clearInterval(interval)
            const noAgent = getAgentsLoaded() && getInstalledAgents().length === 0
            if (noAgent) getDriver()?.moveTo(NO_AGENT_STEP)
            else getDriver()?.moveTo(PRESET_STEP)
          }, 100)
          // Safety: stop polling after 8s
          setTimeout(() => clearInterval(interval), 8000)
        },
      },
    },
    {
      element: '[data-tour="preset-selector"]',
      popover: {
        title: 'Choose a preset',
        description:
          'Open this dropdown and select <strong>Baseline</strong> — it captures the most useful events and adds the auto-start hook on session start. Then click Next.',
      },
    },
    {
      element: '[aria-label="Save hooks config"]',
      popover: {
        title: 'Save your config',
        description:
          'Click Save to write the hooks config to disk. Your agent picks it up on the next session start.',
      },
    },
    {
      popover: {
        title: "You're all set!",
        description:
          'Start a session in your agent and hook events will appear here live. Argus auto-starts from the session-start hook — or run <code>argus start</code> anytime to open the dashboard.',
        doneBtnText: 'Go to Events',
        onNextClick: finish,
      },
    },
    {
      // Reached only when no coding agent is installed. Keep this last so the
      // "done" button ends the tour cleanly.
      element: '[data-tour="hooks-config-add-agent"]',
      popover: {
        title: 'Install an agent first',
        description:
          "We didn't detect an installed coding agent. Argus works with Claude Code, Codex, Cursor, Copilot CLI, and more — install one, then come back here and apply a preset to wire it up. Argus is already running: explore the dashboard meanwhile.",
        doneBtnText: 'Explore Argus',
        onNextClick: finish,
      },
    },
  ]
}
