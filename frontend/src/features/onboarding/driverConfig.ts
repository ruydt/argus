import type { Config } from 'driver.js'

export function createDriverConfig(): Partial<Config> {
  // Darken the dim-overlay more in dark mode so the highlighted cutout reads clearly
  // against the near-black page; lighter in light mode to avoid a harsh blackout.
  const isDark =
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

  return {
    animate: true,
    smoothScroll: true,
    overlayColor: '#000',
    overlayOpacity: isDark ? 0.88 : 0.72,
    popoverClass: 'argus-tour-popover',
    showButtons: ['next', 'previous', 'close'],
    allowClose: true,
  }
}
