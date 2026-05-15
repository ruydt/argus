const NICE_TICK_STEPS_MS = [
  1_000,
  2_000,
  5_000,
  10_000,
  15_000,
  30_000,
  60_000,
  2 * 60_000,
  5 * 60_000,
  10 * 60_000,
  15 * 60_000,
  30 * 60_000,
  60 * 60_000,
] as const

export interface TimelineTick {
  leftPx: number
  label: string
  timeMs: number
}

export function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.round(ms / 1_000))

  if (totalSeconds < 60) {
    return `${totalSeconds}s`
  }

  const seconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)

  if (totalMinutes < 60) {
    return seconds === 0 ? `${totalMinutes}m` : `${totalMinutes}m ${seconds}s`
  }

  const minutes = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60)

  if (minutes === 0 && seconds === 0) {
    return `${hours}h`
  }

  if (seconds === 0) {
    return `${hours}h ${minutes}m`
  }

  return `${hours}h ${minutes}m ${seconds}s`
}

export function chooseTickStep(durationMs: number, contentWidthPx: number, targetSpacingPx = 110) {
  const safeDuration = Math.max(durationMs, 1_000)
  const safeWidth = Math.max(contentWidthPx, targetSpacingPx)
  const approxTickCount = Math.max(1, Math.floor(safeWidth / targetSpacingPx))
  const rawStep = safeDuration / approxTickCount

  const matched = NICE_TICK_STEPS_MS.find((step) => step >= rawStep)
  if (matched) {
    return matched
  }

  const hour = 60 * 60_000
  return Math.ceil(rawStep / hour) * hour
}

export function buildTimelineTicks(durationMs: number, contentWidthPx: number) {
  const safeDuration = Math.max(durationMs, 1_000)
  const safeWidth = Math.max(contentWidthPx, 1)
  const stepMs = chooseTickStep(safeDuration, safeWidth)
  const ticks: TimelineTick[] = []

  for (let timeMs = 0; timeMs <= safeDuration; timeMs += stepMs) {
    ticks.push({
      timeMs,
      label: formatElapsed(timeMs),
      leftPx: (timeMs / safeDuration) * safeWidth,
    })
  }

  if (ticks[ticks.length - 1]?.timeMs !== safeDuration) {
    ticks.push({
      timeMs: safeDuration,
      label: formatElapsed(safeDuration),
      leftPx: safeWidth,
    })
  }

  return { stepMs, ticks }
}
