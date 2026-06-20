import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export type SearchableSelectOption = { label: string; value: string }

type SearchableSelectProps = {
  value: string
  onValueChange: (v: string) => void
  options: SearchableSelectOption[]
  placeholder: string
  ariaLabel: string
  disabled?: boolean
  emptyText?: string
  className?: string
  /** Allow typing a custom value not in the options list */
  creatable?: boolean
  /**
   * Multi-select mode: `value` is a `|`-joined string (e.g. a regex matcher
   * like `Bash|Read`). The empty-string option acts as "clear all"; every other
   * option toggles membership and the popover stays open between picks.
   */
  multiple?: boolean
}

export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder,
  ariaLabel,
  disabled = false,
  emptyText = 'No results',
  className,
  creatable = false,
  multiple = false,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const tokens = multiple && value ? value.split('|').filter(Boolean) : []

  const selected = options.find((opt) => opt.value === value)
  // Trigger label: multi shows the joined tokens (the raw regex) or the
  // match-all option label; single shows the matched option or the raw value.
  const triggerLabel = multiple
    ? tokens.length > 0
      ? tokens.join(' | ')
      : (options.find((o) => o.value === '')?.label ?? undefined)
    : selected
      ? selected.label
      : value || undefined

  const showCreate =
    creatable &&
    query.trim() &&
    !options.some((o) => o.value === query.trim()) &&
    !tokens.includes(query.trim())

  function isChecked(optValue: string): boolean {
    if (!multiple) return optValue === value
    return optValue === '' ? tokens.length === 0 : tokens.includes(optValue)
  }

  function handleSelect(v: string) {
    if (multiple) {
      if (v === '') {
        onValueChange('') // "match all" clears every token
      } else {
        const next = tokens.includes(v) ? tokens.filter((t) => t !== v) : [...tokens, v]
        onValueChange(next.join('|'))
      }
      setQuery('')
      return // keep the popover open for more picks
    }
    onValueChange(v)
    setOpen(false)
    setQuery('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            'justify-between font-normal dark:bg-input/30 dark:hover:bg-input/50',
            className
          )}
        >
          <span className={cn('min-w-0 truncate', !triggerLabel && 'text-muted-foreground')}>
            {triggerLabel ?? placeholder}
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      {/* align="start" is required for Radix to set --radix-popover-trigger-width */}
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command
          filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
        >
          <CommandInput placeholder="Search…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>{showCreate ? null : emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.label}
                  onSelect={() => handleSelect(opt.value)}
                >
                  <Check
                    className={cn('size-4', isChecked(opt.value) ? 'opacity-100' : 'opacity-0')}
                  />
                  <span className="truncate">{opt.label}</span>
                </CommandItem>
              ))}
              {showCreate && (
                <CommandItem
                  key="__create__"
                  value={`__create__${query}`}
                  onSelect={() => handleSelect(query.trim())}
                  forceMount
                >
                  <Check className="size-4 opacity-0" />
                  <span className="truncate text-muted-foreground">
                    Use &ldquo;{query.trim()}&rdquo;
                  </span>
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
