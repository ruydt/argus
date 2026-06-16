import type { ReactNode } from 'react'
import { highlight } from '@/lib/format'

type ErrorBlockProps = {
  errorMessage?: string
  errorType?: string
  searchQuery?: string
}

export function ErrorBlock({ errorMessage, errorType, searchQuery = '' }: ErrorBlockProps) {
  if (!errorMessage && !errorType) return null

  return (
    <div className="mt-2 text-[0.75rem] text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-[6px]">
      <strong className="text-[#b91c1c] text-[0.7rem]">
        Error{errorType ? `: ${errorType}` : ''}
      </strong>
      {errorMessage && (
        <pre className="mt-1 mb-0 whitespace-pre-wrap text-[0.73rem]">
          {highlight(errorMessage, searchQuery) as ReactNode}
        </pre>
      )}
    </div>
  )
}
