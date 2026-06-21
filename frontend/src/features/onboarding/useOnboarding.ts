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
  // Best-effort install state for the tour's no-agent branch. Fetched on mount
  // so it's ready by the time the user clicks into the Hooks step.
  const installedAgentsRef = useRef<string[]>([])
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
      onDestroyStarted: () => {
        markDone()
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

    // Prefetch install state for the tour's no-agent branch (best-effort).
    if (typeof fetch === 'function') {
      fetch('/api/agents')
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { agents?: { id: string; installed?: boolean }[] } | null) => {
          if (data && Array.isArray(data.agents)) {
            installedAgentsRef.current = data.agents.filter((a) => a.installed).map((a) => a.id)
          }
          agentsLoadedRef.current = true
        })
        .catch(() => {
          // Leave agentsLoaded false → tour follows the normal (has-agent) flow.
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
