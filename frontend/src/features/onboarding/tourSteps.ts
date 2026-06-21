import type { DriveStep } from 'driver.js'

type TourDriver = {
  moveNext: () => void
  destroy: () => void
}

type InstalledAgent = { id: string; label: string }

type FirstVisitStepsOptions = {
  navigate: (path: string) => void
  getDriver: () => TourDriver | null
  onComplete: () => void
  // Installed coding agents (from /api/agents), ordered. Drives the add-agent
  // branch: none installed ⇒ end the tour with "install one first"; otherwise
  // point the user at the top agent. Loaded guards a slow/failed fetch — when
  // not loaded we assume an agent is present and follow the full flow.
  getInstalledAgents: () => InstalledAgent[]
  getAgentsLoaded: () => boolean
}

// Poll until `selector` exists, then advance. ALWAYS advances after the safety
// timeout so a missing target can never wedge the tour (the bug where Next did
// nothing on the add-agent step).
function whenPresent(selector: string, advance: () => void) {
  let fired = false
  const run = () => {
    if (fired) return
    fired = true
    advance()
  }
  const interval = setInterval(() => {
    if (document.querySelector(selector)) {
      clearInterval(interval)
      run()
    }
  }, 100)
  setTimeout(() => {
    clearInterval(interval)
    run()
  }, 8000)
}

export function buildFirstVisitSteps({
  navigate,
  getDriver,
  onComplete,
  getInstalledAgents,
  getAgentsLoaded,
}: FirstVisitStepsOptions): DriveStep[] {
  // End the tour where it is — do NOT navigate away.
  const finish = () => {
    onComplete()
    getDriver()?.destroy()
  }

  const installed = getInstalledAgents()
  const hasInstalled = getAgentsLoaded() && installed.length > 0
  const top = installed[0]

  const steps: DriveStep[] = [
    {
      // No element ⇒ centered popover. The tour starts on "/" (set by the caller).
      popover: {
        title: 'Welcome to Argus',
        description:
          "Your hook control center for AI coding agents. Let's get you set up in 60 seconds.",
      },
    },
    {
      element: '[data-tour="sidebar-nav"]',
      popover: {
        title: 'Your workspace',
        description:
          'Three sections live here: <strong>Diagnostics</strong> (health &amp; logs), <strong>Hooks</strong> (manage and test your agent hooks), and <strong>Marketplace</strong> (community hook scripts).',
      },
    },
    {
      element: '[data-tour="hooks-config-link"]',
      popover: {
        title: 'Open Hooks',
        description:
          'This is where you wire up your agent. Click <strong>Next</strong> to open it.',
        onNextClick: () => {
          navigate('/hooks')
          whenPresent('[data-tour="hooks-config-add-agent"]', () => getDriver()?.moveNext())
        },
      },
    },
  ]

  if (!hasInstalled) {
    // No coding agent detected — end here and tell them to install one.
    steps.push({
      element: '[data-tour="hooks-config-add-agent"]',
      popover: {
        title: 'Install an agent first',
        description:
          "We didn't detect any installed coding agent. Install Claude Code, Codex, Cursor, GitHub Copilot CLI, or another supported agent, then reopen Argus to wire it up here.",
        doneBtnText: 'Got it',
        onNextClick: finish,
      },
    })
    return steps
  }

  // At least one agent is installed — add the top one for them, then finish.
  steps.push(
    {
      element: '[data-tour="hooks-config-add-agent"]',
      popover: {
        title: 'Add your agent',
        description: `This is where you add a coding agent. We'll add <strong>${top.label}</strong> for you now — click <strong>Next</strong>.`,
        onNextClick: () => {
          // Tell the Hooks page to enable + select the top agent, then advance
          // once its preset selector renders.
          window.dispatchEvent(new CustomEvent('argus:tour-add-agent', { detail: { id: top.id } }))
          whenPresent('[data-tour="preset-selector"]', () => getDriver()?.moveNext())
        },
      },
    },
    {
      element: '[data-tour="preset-selector"]',
      popover: {
        title: 'Apply a preset',
        description:
          "We'll apply the <strong>Baseline</strong> preset for you — it captures the most useful events and adds the auto-start hook on session start. Click <strong>Next</strong>.",
        onNextClick: () => {
          window.dispatchEvent(
            new CustomEvent('argus:tour-apply-preset', { detail: { key: 'baseline' } })
          )
          whenPresent('[aria-label="Save hooks config"]', () => getDriver()?.moveNext())
        },
      },
    },
    {
      element: '[aria-label="Save hooks config"]',
      popover: {
        title: 'Save your config',
        description:
          'Click <strong>Save</strong> to write the hooks config to disk. Your agent picks it up on its next session start.',
      },
    },
    {
      // Centered finish — stays on the Hooks page.
      popover: {
        title: "You're all set!",
        description:
          'Hook events stream in here live as your agent runs — or run <code>argus start</code> anytime to open the dashboard.',
        doneBtnText: 'Done',
        onNextClick: finish,
      },
    }
  )

  return steps
}
