import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'argus-theme'

// Read the persisted theme; default to dark (the argus-landing neural palette).
// Mirrors the inline boot script in index.html that applies the class pre-paint.
export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
}

// Owns the active theme, keeps <html>.dark in sync, and persists the choice.
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme)

  useEffect(() => {
    applyTheme(theme)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // localStorage unavailable (private mode / test env) — theme still applies for the session
    }
  }, [theme])

  const setTheme = useCallback((next: Theme) => setThemeState(next), [])
  const toggleTheme = useCallback(
    () => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark')),
    []
  )

  return { theme, setTheme, toggleTheme }
}
