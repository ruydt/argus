import type { CtxLine } from '@/types/events'

const EMPTY_CTX: CtxLine[] = []

function extractPatchStartLine(text: string): number {
  if (!text) return 0
  const m = text.match(/@@\s*-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s*@@/)
  return m ? Number(m[1]) : 0
}

type DiffBlockProps = {
  oldStr: string
  newStr: string
  startLine: number
  ctxBefore?: CtxLine[]
  ctxAfter?: CtxLine[]
  patchText?: string
}

export function DiffBlock({
  oldStr,
  newStr,
  startLine,
  ctxBefore = EMPTY_CTX,
  ctxAfter = EMPTY_CTX,
  patchText,
}: DiffBlockProps) {
  const oldLines = oldStr ? oldStr.split('\n') : []
  const newLines = newStr ? newStr.split('\n') : []
  const fallbackStart = extractPatchStartLine(patchText || '')
  const base = startLine > 0 ? startLine : fallbackStart > 0 ? fallbackStart : 1
  let oldLine = base
  let newLine = base

  return (
    <div className="diff-block">
      {ctxBefore.map((l) => (
        <div key={`ctx-b-${l.num}`} className="diff-line diff-ctx">
          <span className="diff-ln">{l.num}</span>
          <span className="diff-marker"> </span>
          <span className="diff-content">{l.text}</span>
        </div>
      ))}
      {oldLines.map((line) => {
        const n = oldLine++
        return (
          <div key={`rm-${n}`} className="diff-line diff-removed">
            <span className="diff-ln">{n}</span>
            <span className="diff-marker">-</span>
            <span className="diff-content">{line}</span>
          </div>
        )
      })}
      {newLines.map((line) => {
        const n = newLine++
        return (
          <div key={`add-${n}`} className="diff-line diff-added">
            <span className="diff-ln">{n}</span>
            <span className="diff-marker">+</span>
            <span className="diff-content">{line}</span>
          </div>
        )
      })}
      {ctxAfter.map((l) => (
        <div key={`ctx-a-${l.num}`} className="diff-line diff-ctx">
          <span className="diff-ln">{l.num}</span>
          <span className="diff-marker"> </span>
          <span className="diff-content">{l.text}</span>
        </div>
      ))}
    </div>
  )
}
