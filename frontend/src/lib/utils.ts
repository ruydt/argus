import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function displayModel(model?: string | null) {
  return model || 'harness'
}

export function displayProvider(provider?: string | null) {
  switch (provider) {
    case 'openai':
      return 'OpenAI'
    case 'anthropic':
      return 'Anthropic'
    default:
      return provider || 'Unknown'
  }
}

export function displayProviderModel(provider?: string | null, model?: string | null) {
  return `${displayProvider(provider)} / ${displayModel(model)}`
}
