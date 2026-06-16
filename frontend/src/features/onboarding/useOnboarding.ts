import { useEffect, useRef, useState } from 'react'
import { driver } from 'driver.js'
import { createDriverConfig } from './driverConfig'
import { buildFirstVisitSteps } from './tourSteps'
import { PAGE_TOURS } from './pageTours'

type UseOnboardingOptions = {
  navigate: (path: string) => void
  forceSidebarOpen: () => void
}

type UseOnboardingReturn = {
  isFirstVisitTourActive: boolean
  startFirstVisitTour: () => void
  startPageTour: (route: string) => void
  markDone: () => void
}

export function useOnboarding({
  navigate,
  forceSidebarOpen,
}: UseOnboardingOptions): UseOnboardingReturn {
  const [isFirstVisitTourActive, setIsFirstVisitTourActive] = useState(false)
  const driverRef = useRef<ReturnType<typeof driver> | null>(null)

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
    })
    driverRef.current = d
    d.drive()
  }

  const startPageTour = (route: string) => {
    const tourDef = PAGE_TOURS[route]
    if (!tourDef) return

    const config = createDriverConfig()
    const steps =
      typeof tourDef === 'function'
        ? tourDef({ navigate, getDriver: () => driverRef.current })
        : tourDef

    if (!steps.length) return

    const d = driver({ ...config, steps })
    driverRef.current = d
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
    startPageTour,
    markDone,
  }
}
