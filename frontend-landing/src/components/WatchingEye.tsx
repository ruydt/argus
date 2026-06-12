import { useEffect, useRef } from 'react'

type WatchingEyeProps = {
  size?: number
  className?: string
  track?: boolean
}

// The Argus eye, awake: the iris follows the visitor's cursor with a slow,
// clamped drift — the watchman noticing, not surveilling. Static for
// reduced-motion users and touch devices.
export function WatchingEye({ size = 72, className, track = true }: WatchingEyeProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const irisRef = useRef<SVGGElement>(null)

  useEffect(() => {
    const svg = svgRef.current
    const iris = irisRef.current
    if (!track || !svg || !iris) return
    if (typeof window.matchMedia !== 'function') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (window.matchMedia('(hover: none)').matches) return

    const MAX_TRAVEL = 2.4 // viewBox units — the iris stays inside the eye
    const EASE = 0.07 // lerp factor — slow, deliberate
    let targetX = 0
    let targetY = 0
    let x = 0
    let y = 0
    let frame = 0

    const onMove = (e: MouseEvent) => {
      const rect = svg.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const dx = e.clientX - cx
      const dy = e.clientY - cy
      const dist = Math.hypot(dx, dy)
      if (dist === 0) return
      // full travel only when the cursor is some distance away
      const reach = Math.min(1, dist / 240)
      targetX = (dx / dist) * MAX_TRAVEL * reach
      targetY = (dy / dist) * MAX_TRAVEL * reach
    }

    const tick = () => {
      x += (targetX - x) * EASE
      y += (targetY - y) * EASE
      iris.setAttribute('transform', `translate(${x.toFixed(3)} ${y.toFixed(3)})`)
      frame = requestAnimationFrame(tick)
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    frame = requestAnimationFrame(tick)
    return () => {
      window.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(frame)
    }
  }, [track])

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" />
      <g ref={irisRef}>
        <circle cx="12" cy="12" r="3.2" stroke="var(--accent)" />
        <circle cx="12" cy="12" r="1.1" fill="var(--accent)" stroke="none" />
        <circle cx="13" cy="11" r="0.35" fill="#fff" stroke="none" />
      </g>
    </svg>
  )
}
