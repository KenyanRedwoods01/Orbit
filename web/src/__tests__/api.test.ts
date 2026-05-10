import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchCSRFToken, clearCSRFToken } from '../lib/api'

// ─── fetchCSRFToken ───────────────────────────────────────────────────────────

describe('fetchCSRFToken', () => {
  beforeEach(() => {
    clearCSRFToken()
    vi.spyOn(globalThis, 'fetch')
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('stores the csrf_token from a successful response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ csrf_token: 'tok-abc' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    await fetchCSRFToken()
    // No direct way to read the module-level variable; ensure no throw
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/csrf-token'),
      expect.objectContaining({ credentials: 'include' })
    )
  })

  it('does not throw on network failure', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network error'))
    await expect(fetchCSRFToken()).resolves.toBeUndefined()
  })

  it('does not throw when response is not ok', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('unauthorized', { status: 401 })
    )
    await expect(fetchCSRFToken()).resolves.toBeUndefined()
  })
})
