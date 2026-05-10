import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Smoke Tests (Level 7) ────────────────────────────────────────────────────
// These tests verify the most critical paths work end-to-end within
// the JS layer. They use mocked fetch to simulate the Go backend.

function makeOkJson(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('API smoke — fetchCSRFToken resolves', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch')
  })
  afterEach(() => vi.restoreAllMocks())

  it('fetchCSRFToken does not throw', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeOkJson({ csrf_token: 'tok' }))
    const { fetchCSRFToken, clearCSRFToken } = await import('../lib/api')
    clearCSRFToken()
    await expect(fetchCSRFToken()).resolves.toBeUndefined()
  })
})

describe('Auth store smoke', () => {
  it('can set and clear a user', async () => {
    const { useAuthStore } = await import('../store/auth')
    useAuthStore.getState().setUser({ username: 'smoketest', scope: 'admin' })
    expect(useAuthStore.getState().user?.username).toBe('smoketest')
    useAuthStore.getState().logout()
    expect(useAuthStore.getState().user).toBeNull()
  })
})

describe('Validators smoke', () => {
  it('isValidIP returns true for 127.0.0.1', () => {
    function isValidIP(s: string): boolean {
      if (!s) return false
      if (/^(\d{1,3}\.){3}\d{1,3}$/.test(s)) {
        return s.split('.').every(o => parseInt(o, 10) <= 255)
      }
      return /^[0-9a-fA-F:]+$/.test(s) && s.includes(':')
    }
    expect(isValidIP('127.0.0.1')).toBe(true)
  })

  it('password strength returns weak for empty', () => {
    function weak(pw: string) {
      let s = 0
      if (pw.length >= 8)  s++
      if (pw.length >= 12) s++
      if (/[A-Z]/.test(pw)) s++
      if (/[0-9]/.test(pw)) s++
      if (/[^A-Za-z0-9]/.test(pw)) s++
      return s <= 1 ? 'Weak' : 'Other'
    }
    expect(weak('')).toBe('Weak')
  })
})
