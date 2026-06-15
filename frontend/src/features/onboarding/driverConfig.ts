import type { Config } from 'driver.js'

export function createDriverConfig(): Partial<Config> {
  return {
    animate: true,
    smoothScroll: true,
    overlayColor: '#000',
    overlayOpacity: 0.72,
    popoverClass: 'argus-tour-popover',
    showButtons: ['next', 'previous', 'close'],
    allowClose: true,
  }
}
