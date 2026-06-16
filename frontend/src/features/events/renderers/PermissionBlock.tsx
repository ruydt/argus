type Question = {
  question: string
  header: string
  multiSelect?: boolean
  options: Array<{ label: string; description: string }>
}

type PermissionSuggestion = {
  type: string
  rules: Array<{ toolName: string; ruleContent: string }>
  behavior: string
  destination: string
}

type PermissionBlockProps = {
  toolName?: string
  toolInputQuestionsJson?: string
  permissionSuggestionsJson?: string
}

function parseJSON<T>(raw: string | undefined): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function asArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : []
}

export function PermissionBlock({
  toolName,
  toolInputQuestionsJson,
  permissionSuggestionsJson,
}: PermissionBlockProps) {
  const questionsRaw =
    toolName === 'AskUserQuestion' ? parseJSON<Question[]>(toolInputQuestionsJson) : null
  const questions = asArray(questionsRaw ?? undefined)

  const suggestions = asArray(
    parseJSON<PermissionSuggestion[]>(permissionSuggestionsJson) ?? undefined
  )

  if (questions.length === 0 && suggestions.length === 0) return null

  return (
    <div className="mt-2 flex flex-col gap-2">
      {questions.length > 0 &&
        questions.map((q, qi) => (
          <div
            key={qi}
            className="select-text rounded-[6px] border border-black/[0.05] bg-black/[0.04] px-3 py-2 text-[0.75rem] text-[#171717]"
            data-event-drag-ignore
          >
            <strong className="text-[#666666] text-[0.7rem]">{q.header}</strong>
            <p className="mt-1 mb-2 text-[0.75rem] text-[#c8c8c8]">{q.question}</p>
            <ul className="m-0 flex flex-col gap-1 p-0 list-none">
              {asArray(q.options).map((opt, oi) => (
                <li key={oi} className="flex gap-2">
                  <span className="mt-[2px] shrink-0 text-[0.65rem] text-[#666666]">
                    {q.multiSelect ? '□' : '○'}
                  </span>
                  <span>
                    <span className="text-[0.73rem] text-[#666666]">{opt.label}</span>
                    {opt.description && (
                      <span className="ml-1 text-[0.7rem] text-[#666666]">— {opt.description}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}

      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1" data-event-drag-ignore>
          {suggestions.map((s, si) =>
            asArray(s.rules).map((r, ri) => (
              <span
                key={`${si}-${ri}`}
                className="inline-flex items-center gap-1 rounded-full border border-black/[0.08] bg-black/[0.04] px-2 py-0.5 text-[0.68rem]"
              >
                <span className={s.behavior === 'allow' ? 'text-[#16a34a]' : 'text-[#dc2626]'}>
                  {s.behavior}
                </span>
                <span className="text-[#666666]">
                  &quot;{r.ruleContent}&quot; → {s.destination}
                </span>
              </span>
            ))
          )}
        </div>
      )}
    </div>
  )
}
