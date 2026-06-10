import type { CSSProperties, ReactNode } from 'react'
import { useAnimateOnScroll } from '../hooks/useAnimateOnScroll'

type AnimateOnScrollProps = {
  children: ReactNode
  className?: string
  style?: CSSProperties
  delay?: number
}

export function AnimateOnScroll({ children, className, style, delay = 0 }: AnimateOnScrollProps) {
  const ref = useAnimateOnScroll<HTMLDivElement>()
  return (
    <div
      ref={ref}
      className={`animate-on-scroll${className ? ` ${className}` : ''}`}
      style={{ ...style, transitionDelay: delay ? `${delay}ms` : undefined }}
    >
      {children}
    </div>
  )
}
