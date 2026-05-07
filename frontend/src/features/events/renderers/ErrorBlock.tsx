type ErrorBlockProps = {
  errorMessage?: string
  errorType?: string
}

export function ErrorBlock({ errorMessage, errorType }: ErrorBlockProps) {
  if (!errorMessage && !errorType) return null

  return (
    <div className="mt-2 text-[0.75rem] text-[#ff6b6b] bg-red-950/20 border border-red-900/30 px-3 py-2 rounded-[6px]">
      <strong className="text-[#ff9999] text-[0.7rem]">
        Error{errorType ? `: ${errorType}` : ''}
      </strong>
      {errorMessage && (
        <pre className="mt-1 mb-0 whitespace-pre-wrap text-[0.73rem]">{errorMessage}</pre>
      )}
    </div>
  )
}
