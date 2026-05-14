import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function displayModel(model?: string | null) {
  return model ?? ''
}

export function displayProvider(provider?: string | null) {
  switch (provider) {
    case 'openai':
      return 'OpenAI'
    case 'anthropic':
      return 'Anthropic'
    case 'google':
      return 'Google'
    default:
      return provider ?? ''
  }
}

export function displayProviderModel(provider?: string | null, model?: string | null) {
  const parts = [displayProvider(provider), displayModel(model)].filter(Boolean)
  return parts.join(' / ')
}
