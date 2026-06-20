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
