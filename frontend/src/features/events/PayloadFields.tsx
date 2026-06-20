import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// PayloadFields renders a parsed hook payload as a stack of labeled field cards
// (the "Fields" view), an alternative to the raw JSON. Primitives and arrays of
// primitives render inline; nested objects and arrays of objects collapse.

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

const GLYPH = {
  string: 'T',
  number: '#',
  boolean: 'B',
  null: '∅',
  array: '[]',
  object: '{}',
} as const

function humanize(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function isPlainObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isPrimitive(value: JsonValue): boolean {
  return value === null || typeof value !== 'object'
}

function primitiveText(value: JsonValue): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return value
  return String(value)
}

function primitiveGlyph(value: JsonValue): string {
  if (value === null) return GLYPH.null
  if (typeof value === 'number') return GLYPH.number
  if (typeof value === 'boolean') return GLYPH.boolean
  return GLYPH.string
}

function Glyph({ children }: { children: string }) {
  return (
    <span
      aria-hidden
      className="mt-px w-5 shrink-0 text-center font-mono text-[0.72rem] text-muted-foreground/70"
    >
      {children}
    </span>
  )
}

type LeafProps = { label: string; glyph: string; value: string }

function Leaf({ label, glyph, value }: LeafProps) {
  return (
    <div className="flex items-start gap-1.5 rounded-lg border border-border bg-card px-3 py-2">
      <Glyph>{glyph}</Glyph>
      <div className="min-w-0 flex-1 text-[0.82rem] leading-[1.45]">
        <span className="font-semibold text-foreground">{label}</span>{' '}
        <span className="break-words whitespace-pre-wrap text-muted-foreground">{value}</span>
      </div>
    </div>
  )
}

type GroupProps = { label: string; glyph: string; count?: number; children: React.ReactNode }

function Group({ label, glyph, count, children }: GroupProps) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-[0.82rem] hover:bg-foreground/[0.03]"
        aria-expanded={open}
      >
        <ChevronRight
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-90'
          )}
        />
        <Glyph>{glyph}</Glyph>
        <span className="font-semibold text-foreground">{label}</span>
        {count !== undefined && (
          <span className="font-mono text-[0.72rem] text-muted-foreground/70">[{count}]</span>
        )}
      </button>
      {open && (
        <div className="space-y-1.5 border-t border-border/60 px-3 py-2 pl-5">{children}</div>
      )}
    </div>
  )
}

function renderField(label: string, value: JsonValue, key: string): React.ReactNode {
  // Primitive → inline leaf.
  if (isPrimitive(value)) {
    return (
      <Leaf key={key} label={label} glyph={primitiveGlyph(value)} value={primitiveText(value)} />
    )
  }

  // Array.
  if (Array.isArray(value)) {
    // Array of primitives → joined inline as text.
    if (value.every(isPrimitive)) {
      const text = value.length ? value.map(primitiveText).join(', ') : '—'
      return <Leaf key={key} label={label} glyph={GLYPH.string} value={text} />
    }
    // Array with nested values → collapsible.
    return (
      <Group key={key} label={label} glyph={GLYPH.array} count={value.length}>
        {value.map((item, i) => renderField(`[${i}]`, item, `${key}.${i}`))}
      </Group>
    )
  }

  // Object → collapsible.
  const entries = isPlainObject(value) ? Object.entries(value) : []
  return (
    <Group key={key} label={label} glyph={GLYPH.object} count={entries.length}>
      {entries.map(([k, v]) => renderField(humanize(k), v, `${key}.${k}`))}
    </Group>
  )
}

type PayloadFieldsProps = { value: unknown }

export function PayloadFields({ value }: PayloadFieldsProps) {
  const root = value as JsonValue
  if (!isPlainObject(root)) {
    return <Leaf label="Value" glyph={primitiveGlyph(root)} value={primitiveText(root)} />
  }
  const entries = Object.entries(root)
  if (entries.length === 0) {
    return <p className="px-1 text-sm text-muted-foreground">Empty payload.</p>
  }
  return (
    <div className="space-y-1.5">{entries.map(([k, v]) => renderField(humanize(k), v, k))}</div>
  )
}
