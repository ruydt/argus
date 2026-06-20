import { useState } from 'react'
import type { ReactNode } from 'react'
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

export type SearchSelectOption = {
  value: string
  label: string
  icon?: ReactNode
  hint?: string
  disabled?: boolean
}

type SearchSelectProps = {
  options: SearchSelectOption[]
  onSelect: (value: string) => void
  // The clickable element that opens the popover (passed asChild to the trigger).
  trigger: ReactNode
  placeholder?: string
  emptyText?: string
  align?: 'start' | 'center' | 'end'
  contentClassName?: string
}

// SearchSelect is a searchable single-select combobox (shadcn Command in a
// Popover). Disabled options stay visible but are not selectable — used to show
// not-installed agents in the "Add agent" list.
export function SearchSelect({
  options,
  onSelect,
  trigger,
  placeholder = 'Search…',
  emptyText = 'No results.',
  align = 'start',
  contentClassName,
}: SearchSelectProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} className={cn('w-64 p-0', contentClassName)}>
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  // Include the value so search matches on both label and id.
                  value={`${opt.label} ${opt.value}`}
                  disabled={opt.disabled}
                  onSelect={() => {
                    if (opt.disabled) return
                    onSelect(opt.value)
                    setOpen(false)
                  }}
                  className={cn('flex items-center gap-2', opt.disabled && 'opacity-50')}
                >
                  {opt.icon}
                  <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                  {opt.hint && (
                    <span className="shrink-0 text-[11px] text-muted-foreground">{opt.hint}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
