import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useSetupStatus, MAX_RETRIES, RETRY_DELAY_MS } from '../hooks/useSetupStatus'

// Use fast retries so tests complete in milliseconds, not seconds
const FAST: { retryDelayMs: number; maxRetries: number } = { retryDelayMs: 5, maxRetries: 4 }

// ── helpers ───────────────────────────────────────────────────────────────────

function okResponse(setup_required: boolean) {
  return Promise.resolve(
    new Response(JSON.stringify({ setup_required }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function failResponse(status = 503) {
  return Promise.resolve(new Response('error', { status }))
}

function networkError() {
  return Promise.reject(new Error('Network error'))
}

// ── setup/teardown ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ── tests ─────────────────────────────────────────────────────────────────────

describe('useSetupStatus', () => {
  it('starts in loading state with null setupRequired', () => {
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}))
    const { result } = renderHook(() => useSetupStatus(FAST))

    expect(result.current.loading).toBe(true)
    expect(result.current.setupRequired).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.retryCount).toBe(0)
  })

  it('resolves setupRequired=false on immediate success', async () => {
    vi.mocked(fetch).mockImplementation(() => okResponse(false))
    const { result } = renderHook(() => useSetupStatus(FAST))

    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 2000 })

    expect(result.current.setupRequired).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.retryCount).toBe(0)
  })

  it('resolves setupRequired=true on immediate success', async () => {
    vi.mocked(fetch).mockImplementation(() => okResponse(true))
    const { result } = renderHook(() => useSetupStatus(FAST))

    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 2000 })

    expect(result.current.setupRequired).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('increments retryCount on transient failures then succeeds', async () => {
    let calls = 0
    vi.mocked(fetch).mockImplementation(() => {
      calls++
      if (calls < 3) return networkError()
      return okResponse(false)
    })

    const { result } = renderHook(() => useSetupStatus(FAST))

    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 })

    expect(result.current.setupRequired).toBe(false)
    expect(result.current.retryCount).toBeGreaterThanOrEqual(2)
    expect(result.current.error).toBeNull()
  })

  it('enters error state after maxRetries failures', async () => {
    vi.mocked(fetch).mockImplementation(() => networkError())

    const { result } = renderHook(() => useSetupStatus(FAST))

    await waitFor(() => expect(result.current.error).not.toBeNull(), { timeout: 5000 })

    expect(result.current.loading).toBe(false)
    expect(result.current.setupRequired).toBeNull()
    expect(result.current.error).toMatch(/unable to reach/i)
    expect(result.current.retryCount).toBe(FAST.maxRetries)
  })

  it('retry() resets state and re-runs the check', async () => {
    let gen = 0
    vi.mocked(fetch).mockImplementation(() => {
      gen++
      if (gen <= FAST.maxRetries + 1) return networkError()
      return okResponse(false)
    })

    const { result } = renderHook(() => useSetupStatus(FAST))

    await waitFor(() => expect(result.current.error).not.toBeNull(), { timeout: 5000 })

    act(() => { result.current.retry() })

    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 2000 })
    expect(result.current.setupRequired).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('handles malformed JSON response shape as a transient failure', async () => {
    let calls = 0
    vi.mocked(fetch).mockImplementation(() => {
      calls++
      if (calls === 1) {
        return Promise.resolve(
          new Response(JSON.stringify({ wrong_key: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }
      return okResponse(false)
    })

    const { result } = renderHook(() => useSetupStatus(FAST))

    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 })
    expect(result.current.setupRequired).toBe(false)
    expect(result.current.retryCount).toBeGreaterThanOrEqual(1)
  })

  it('handles non-ok HTTP response as a transient failure', async () => {
    let calls = 0
    vi.mocked(fetch).mockImplementation(() => {
      calls++
      if (calls === 1) return failResponse(503)
      return okResponse(false)
    })

    const { result } = renderHook(() => useSetupStatus(FAST))

    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 })
    expect(result.current.setupRequired).toBe(false)
    expect(result.current.retryCount).toBeGreaterThanOrEqual(1)
  })

  it('retry() function reference is stable (memoized)', async () => {
    vi.mocked(fetch).mockImplementation(() => okResponse(false))
    const { result } = renderHook(() => useSetupStatus(FAST))

    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 2000 })

    const retry1 = result.current.retry
    const retry2 = result.current.retry
    expect(retry1).toBe(retry2)
  })

  it('does not update state after unmount', async () => {
    let resolve!: (r: Response) => void
    vi.mocked(fetch).mockImplementation(
      () => new Promise<Response>(r => { resolve = r }),
    )

    const { result, unmount } = renderHook(() => useSetupStatus(FAST))
    expect(result.current.loading).toBe(true)

    unmount()

    act(() => {
      resolve(
        new Response(JSON.stringify({ setup_required: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    })

    expect(result.current.loading).toBe(true)
    expect(result.current.setupRequired).toBeNull()
  })

  it('exports MAX_RETRIES and RETRY_DELAY_MS as positive numbers', () => {
    expect(typeof MAX_RETRIES).toBe('number')
    expect(MAX_RETRIES).toBeGreaterThan(0)
    expect(typeof RETRY_DELAY_MS).toBe('number')
    expect(RETRY_DELAY_MS).toBeGreaterThan(0)
  })
})
