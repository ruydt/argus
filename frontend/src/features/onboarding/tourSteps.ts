import type { DriveStep } from 'driver.js'

type FirstVisitStepsOptions = {
  navigate: (path: string) => void
  getDriver: () => { moveNext: () => void; destroy: () => void } | null
  onComplete: () => void
}

export function buildFirstVisitSteps({
  navigate,
  getDriver,
  onComplete,
}: FirstVisitStepsOptions): DriveStep[] {
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
        description: 'First, wire up your agent. Click <strong>Next</strong> to open Hooks Config.',
        onNextClick: () => {
          navigate('/hooks-config')
          // Poll until the preset selector renders (page is lazy-loaded)
          const interval = setInterval(() => {
            if (document.querySelector('[data-tour="preset-selector"]')) {
              clearInterval(interval)
              getDriver()?.moveNext()
            }
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
          'Open this dropdown and select <strong>Baseline</strong> — it captures the most useful events. Then click Next.',
      },
    },
    {
      element: '[aria-label="Save hooks config"]',
      popover: {
        title: 'Save your config',
        description:
          'Click Save to write the hooks config to disk. Claude Code picks it up on the next session start.',
      },
    },
    {
      popover: {
        title: "You're all set!",
        description:
          'Go back to Claude Code and start coding. Hook events will appear here live as your agent runs.',
        doneBtnText: 'Go to Events',
        onNextClick: () => {
          onComplete()
          navigate('/')
          getDriver()?.destroy()
        },
      },
    },
  ]
}
