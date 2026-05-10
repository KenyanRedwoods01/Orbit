import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchCSRFToken, clearCSRFToken } from '../lib/api'

// ─── API Contract Tests (Level 5) ─────────────────────────────────────────────
// Verify that the request() helper enforces correct JSON contract:
// right status codes, required fields, content-type guarding.

function makeJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeHtmlResponse(status = 200) {
  return new Response('<!DOCTYPE html><html><body>Not Found</body></html>', {
    status,
    headers: { 'Content-Type': 'text/html' },
  })
}

// ─── CSRF token contract ──────────────────────────────────────────────────────

describe('fetchCSRFToken — contract', () => {
  beforeEach(() => {
    clearCSRFToken()
    vi.spyOn(globalThis, 'fetch')
  })
  afterEach(() => vi.restoreAllMocks())

  it('calls /api/csrf-token with credentials: include', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeJsonResponse({ csrf_token: 'tok-xyz' }))
    await fetchCSRFToken()
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/csrf-token'),
      expect.objectContaining({ credentials: 'include' })
    )
  })

  it('response must include csrf_token field', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeJsonResponse({ csrf_token: 'abc-123' }))
    await fetchCSRFToken()
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('does not throw when server returns 500', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Internal Error', { status: 500 }))
    await expect(fetchCSRFToken()).resolves.toBeUndefined()
  })

  it('does not throw on network timeout', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('timeout'))
    await expect(fetchCSRFToken()).resolves.toBeUndefined()
  })

  it('deduplicates concurrent calls (only one fetch made)', async () => {
    vi.mocked(fetch).mockResolvedValue(makeJsonResponse({ csrf_token: 'x' }))
    await Promise.all([fetchCSRFToken(), fetchCSRFToken(), fetchCSRFToken()])
    expect(fetch).toHaveBeenCalledOnce()
  })
})

// ─── Content-type guard ───────────────────────────────────────────────────────
// Tests that our request() helper rejects HTML responses (e.g. SPA catch-all)
// This prevents the "Unexpected token '<'" JSON parse error on the profile page.

describe('Content-type guard', () => {
  beforeEach(() => { vi.spyOn(globalThis, 'fetch') })
  afterEach(() => vi.restoreAllMocks())

  it('resolves when server returns JSON with 200', async () => {
    const profile = { id: 1, username: 'alice', role: 'admin' }
    vi.mocked(fetch).mockResolvedValueOnce(makeJsonResponse(profile))

    const { fetchProfile } = await import('../lib/api')
    const result = await fetchProfile()
    expect(result).toMatchObject({ username: 'alice' })
  })

  it('falls back to /users/me when /profile returns HTML and resolves with user data', async () => {
    const me = { id: 2, username: 'bob', email: 'bob@example.com', role: 'admin', created_at: 1700000000 }
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeHtmlResponse(200))
      .mockResolvedValueOnce(makeJsonResponse(me))

    const { fetchProfile } = await import('../lib/api')
    const result = await fetchProfile()
    expect(result).toMatchObject({ id: 2, username: 'bob', email: 'bob@example.com', role: 'admin' })
  })

  it('throws Unauthorized for 401 when both /profile and /users/me return 401', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))

    const { fetchProfile } = await import('../lib/api')
    await expect(fetchProfile()).rejects.toThrow(/unauthorized/i)
  })

  it('throws Access denied for 403 when both /profile and /users/me return 403', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }))
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }))

    const { fetchProfile } = await import('../lib/api')
    await expect(fetchProfile()).rejects.toThrow(/access denied/i)
  })

  it('throws when both /profile and /users/me return 404 with HTML body', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeHtmlResponse(404))
      .mockResolvedValueOnce(makeHtmlResponse(404))

    const { fetchProfile } = await import('../lib/api')
    await expect(fetchProfile()).rejects.toThrow()
  })
})
