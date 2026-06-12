type ArgusEyeProps = {
  className?: string
}

// Argus brand mark — all-seeing eye (lucide-style strokes, inherits currentColor)
export function ArgusEye({ className }: ArgusEyeProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r=".5" fill="currentColor" />
    </svg>
  )
}
