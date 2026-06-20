import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTheme } from '@/hooks/useTheme'
import { cn } from '@/lib/utils'

type ThemeToggleProps = {
  collapsed: boolean
  showCollapsedTooltips: boolean
  desktopNavLabelClassName: string
}

// Light/dark switch styled to match the sidebar Tour button. Toggles the
// .dark class on <html> via useTheme; choice persists in localStorage.
export function ThemeToggle({
  collapsed,
  showCollapsedTooltips,
  desktopNavLabelClassName,
}: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode'
  const Icon = isDark ? Sun : Moon

  const buttonClassName = cn(
    'h-7 gap-0 border border-transparent text-[0.72rem] font-normal text-muted-foreground transition-colors duration-200 hover:border-foreground/[0.08] hover:bg-foreground/[0.05] hover:text-foreground',
    collapsed ? 'w-full justify-center rounded-lg px-0' : 'w-full justify-start rounded-lg px-0'
  )

  if (showCollapsedTooltips) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            onClick={toggleTheme}
            className={cn(buttonClassName, 'justify-center px-0')}
            aria-label={label}
          >
            <Icon className="size-[15px] shrink-0" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={10}>
          {label}
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={toggleTheme}
      className={buttonClassName}
      aria-label={label}
    >
      <span className="flex size-7 shrink-0 items-center justify-center">
        <Icon className="size-[15px] shrink-0" />
      </span>
      <span aria-hidden="true" className={desktopNavLabelClassName}>
        {isDark ? 'Light mode' : 'Dark mode'}
      </span>
    </Button>
  )
}
