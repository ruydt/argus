import { useEffect, useRef, useState } from 'react'
import { driver } from 'driver.js'
import { createDriverConfig } from './driverConfig'
import { enableTourScrollForwarding } from './tourScroll'
import { buildFirstVisitSteps } from './tourSteps'

type UseOnboardingOptions = {
  navigate: (path: string) => void
  forceSidebarOpen: () => void
}

type UseOnboardingReturn = {
  isFirstVisitTourActive: boolean
  startFirstVisitTour: () => void
  markDone: () => void
}

export function useOnboarding({
  navigate,
  forceSidebarOpen,
}: UseOnboardingOptions): UseOnboardingReturn {
  const [isFirstVisitTourActive, setIsFirstVisitTourActive] = useState(false)
  const driverRef = useRef<ReturnType<typeof driver> | null>(null)
  const scrollCleanupRef = useRef<(() => void) | null>(null)
  // Best-effort installed-agent list for the tour's add-agent branch. Fetched on
  // mount so it's ready by the time the user reaches the Hooks step.
  const installedAgentsRef = useRef<{ id: string; label: string }[]>([])
  const agentsLoadedRef = useRef(false)

  const stopScrollForwarding = () => {
    scrollCleanupRef.current?.()
    scrollCleanupRef.current = null
  }

  const startScrollForwarding = () => {
    stopScrollForwarding()
    scrollCleanupRef.current = enableTourScrollForwarding(() => driverRef.current?.refresh())
  }

  const markDone = () => {
    localStorage.setItem('argus_onboarding_done', '1')
    setIsFirstVisitTourActive(false)
  }

  const startFirstVisitTour = () => {
    forceSidebarOpen()
    setIsFirstVisitTourActive(true)
    // Start the tour from the home/events page so the sidebar intro reads in order.
    navigate('/')

    const config = createDriverConfig()
    const steps = buildFirstVisitSteps({
      navigate,
      getDriver: () => driverRef.current,
      onComplete: markDone,
      getInstalledAgents: () => installedAgentsRef.current,
      getAgentsLoaded: () => agentsLoadedRef.current,
    })

    const d = driver({
      ...config,
      steps,
      // Overriding onDestroyStarted replaces driver.js's default destroy, so we
      // must destroy ourselves — otherwise the X / overlay click does nothing.
      onDestroyStarted: () => {
        markDone()
        driverRef.current?.destroy()
      },
      onDestroyed: () => {
        stopScrollForwarding()
      },
    })
    driverRef.current = d
    startScrollForwarding()
    d.drive()
  }

  useEffect(() => {
    const done = localStorage.getItem('argus_onboarding_done')
    if (done) return

    // Prefetch installed agents for the tour's add-agent branch (best-effort).
    if (typeof fetch === 'function') {
      fetch('/api/agents')
        .then((res) => (res.ok ? res.json() : null))
        .then(
          (
            data: { agents?: { id: string; display_name?: string; installed?: boolean }[] } | null
          ) => {
            if (data && Array.isArray(data.agents)) {
              installedAgentsRef.current = data.agents
                .filter((a) => a.installed)
                .map((a) => ({ id: a.id, label: a.display_name || a.id }))
            }
            agentsLoadedRef.current = true
          }
        )
        .catch(() => {
          // Leave agentsLoaded false → tour follows the full (has-agent) flow.
        })
    }

    const timer = setTimeout(() => {
      startFirstVisitTour()
    }, 800)

    return () => clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    isFirstVisitTourActive,
    startFirstVisitTour,
    markDone,
  }
}
