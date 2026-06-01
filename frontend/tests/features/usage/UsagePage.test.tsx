import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UsagePage } from '@/features/usage/UsagePage'

// Full localStorage mock to survive unstubGlobals: true restoring localStorage to undefined
// (pattern: vi.stubGlobal so it is re-stubbed in each beforeEach)
const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}

function renderUsagePage() {
  return render(
    <MemoryRouter>
      <UsagePage />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  // Re-stub localStorage each test so unstubGlobals restore doesn't leave it undefined
  vi.stubGlobal('localStorage', localStorageMock)
  localStorageMock.getItem.mockReturnValue(null)
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    })
  )
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('UsagePage', () => {
  it('renders the page heading', () => {
    renderUsagePage()
    expect(screen.getByText('OpenAI Usage')).toBeInTheDocument()
  })

  it('renders empty state when no API key is set', () => {
    renderUsagePage()
    // UsagePanel shows "Admin API Key Required" when no key present
    expect(screen.getByText('Admin API Key Required')).toBeInTheDocument()
  })

  it('renders API key input field', () => {
    renderUsagePage()
    const input = screen.getByPlaceholderText('OpenAI Admin API Key...')
    expect(input).toBeInTheDocument()
  })

  it('renders provider selector trigger', () => {
    renderUsagePage()
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('renders Fetch button', () => {
    renderUsagePage()
    expect(screen.getByRole('button', { name: 'Fetch' })).toBeInTheDocument()
  })

  it('shows loading state when openai_admin_key is set and fetch is pending', () => {
    // Return sk-test for openai_admin_key; null for everything else (cache keys, anthropic key)
    localStorageMock.getItem.mockImplementation((key: string) => {
      if (key === 'openai_admin_key') return 'sk-test'
      return null
    })
    // Never-resolving fetch keeps loading=true and stats=null
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}))
    vi.stubGlobal('fetch', fetchMock)

    renderUsagePage()

    // Page heading remains visible
    expect(screen.getByText('OpenAI Usage')).toBeInTheDocument()
    // Button is disabled and shows "Loading..." while fetch is pending
    const btn = screen.getByRole('button', { name: 'Loading...' })
    expect(btn).toBeDisabled()
    // Loading spinner panel is rendered
    expect(screen.getByText('Loading usage data...')).toBeInTheDocument()
    // Verify that the auto-fetch effect was actually triggered
    expect(fetchMock).toHaveBeenCalled()
  })

  it('renders charts and tables with populated usage data', async () => {
    // Deterministic day: 2026-05-31T00:00:00Z = Unix 1748649600
    const bucketStartTime = 1748649600
    const bucketEndTime = bucketStartTime + 86400

    // Primary completions response: 1 bucket with requests and tokens
    const primaryCompletionsResponse = {
      data: [
        {
          start_time: bucketStartTime,
          end_time: bucketEndTime,
          results: [
            {
              num_model_requests: 5,
              input_tokens: 1000,
              output_tokens: 500,
            },
          ],
        },
      ],
    }

    // Model-grouped response: 1 bucket with gpt-test model
    const modelGroupedResponse = {
      data: [
        {
          start_time: bucketStartTime,
          end_time: bucketEndTime,
          results: [
            {
              model: 'gpt-test',
              num_model_requests: 5,
              input_tokens: 1000,
              output_tokens: 500,
            },
          ],
        },
      ],
    }

    // API key-grouped response: 1 bucket with key-test
    const keyGroupedResponse = {
      data: [
        {
          start_time: bucketStartTime,
          end_time: bucketEndTime,
          results: [
            {
              api_key_id: 'key-test',
              input_tokens: 1000,
              output_tokens: 500,
            },
          ],
        },
      ],
    }

    // Return sk-test for openai_admin_key; null for everything else
    localStorageMock.getItem.mockImplementation((key: string) => {
      if (key === 'openai_admin_key') return 'sk-test'
      return null
    })

    // Three fetch responses in order: primary completions, model-grouped, api-key-grouped
    // Promise.all fires all three concurrently — mockResolvedValueOnce delivers in call order
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => primaryCompletionsResponse })
        .mockResolvedValueOnce({ ok: true, json: async () => modelGroupedResponse })
        .mockResolvedValueOnce({ ok: true, json: async () => keyGroupedResponse })
    )

    renderUsagePage()

    // Wait for charts and tables to appear after fetches resolve
    expect(await screen.findByText(/Total Tokens/)).toBeInTheDocument()
    expect(screen.getByText(/Total Requests/)).toBeInTheDocument()
    expect(screen.getByText('Model Breakdown')).toBeInTheDocument()
    expect(screen.getByText('API Key Breakdown')).toBeInTheDocument()

    // Fixture values prove aggregation wired through real hook
    await waitFor(() => {
      expect(screen.getByText('gpt-test')).toBeInTheDocument()
    })
    expect(screen.getByText('key-test')).toBeInTheDocument()
  })
})
