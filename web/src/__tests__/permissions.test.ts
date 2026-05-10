import { describe, it, expect } from 'vitest'

// ─── Permission / Role logic tests (Level 2) ──────────────────────────────────
// Mirrors the scopeAllowsWrite logic in the Go backend and any
// frontend role-gating utilities.

type Scope = 'admin' | 'write' | 'ui' | 'deploy' | 'read-only' | 'read:servers' | string

function scopeAllowsWrite(scope: Scope): boolean {
  switch (scope) {
    case 'admin':
    case 'write':
    case 'ui':
    case 'deploy':
      return true
    case 'read-only':
    case 'read:servers':
      return false
    default:
      return false
  }
}

function isAdmin(scope: Scope): boolean {
  return scope === 'admin'
}

function canDestructiveAction(scope: Scope): boolean {
  return scope === 'admin'
}

describe('scopeAllowsWrite', () => {
  it('admin can write', () => {
    expect(scopeAllowsWrite('admin')).toBe(true)
  })
  it('write scope can write', () => {
    expect(scopeAllowsWrite('write')).toBe(true)
  })
  it('ui scope can write', () => {
    expect(scopeAllowsWrite('ui')).toBe(true)
  })
  it('deploy scope can write', () => {
    expect(scopeAllowsWrite('deploy')).toBe(true)
  })
  it('read-only cannot write', () => {
    expect(scopeAllowsWrite('read-only')).toBe(false)
  })
  it('read:servers cannot write', () => {
    expect(scopeAllowsWrite('read:servers')).toBe(false)
  })
  it('unknown scope defaults to no write', () => {
    expect(scopeAllowsWrite('unknown-scope')).toBe(false)
    expect(scopeAllowsWrite('')).toBe(false)
  })
})

describe('isAdmin', () => {
  it('returns true only for admin', () => {
    expect(isAdmin('admin')).toBe(true)
  })
  it('returns false for write scope', () => {
    expect(isAdmin('write')).toBe(false)
  })
  it('returns false for ui scope', () => {
    expect(isAdmin('ui')).toBe(false)
  })
})

describe('canDestructiveAction', () => {
  it('only admin can perform destructive actions', () => {
    expect(canDestructiveAction('admin')).toBe(true)
    expect(canDestructiveAction('write')).toBe(false)
    expect(canDestructiveAction('deploy')).toBe(false)
    expect(canDestructiveAction('read-only')).toBe(false)
  })
})

// ─── Route guard logic ─────────────────────────────────────────────────────────

interface RouteGuard { path: string; requiredScope: Scope[] }

const PROTECTED_ROUTES: RouteGuard[] = [
  { path: '/settings',  requiredScope: ['admin'] },
  { path: '/users',     requiredScope: ['admin'] },
  { path: '/firewall',  requiredScope: ['admin', 'ui'] },
  { path: '/dashboard', requiredScope: ['admin', 'ui', 'read-only'] },
]

function canAccessRoute(path: string, scope: Scope): boolean {
  const route = PROTECTED_ROUTES.find(r => path.startsWith(r.path))
  if (!route) return true
  return route.requiredScope.includes(scope)
}

describe('canAccessRoute', () => {
  it('allows admin to access all routes', () => {
    for (const route of PROTECTED_ROUTES) {
      expect(canAccessRoute(route.path, 'admin')).toBe(true)
    }
  })

  it('allows read-only user to access dashboard', () => {
    expect(canAccessRoute('/dashboard', 'read-only')).toBe(true)
  })

  it('blocks read-only user from settings', () => {
    expect(canAccessRoute('/settings', 'read-only')).toBe(false)
  })

  it('blocks read-only user from user management', () => {
    expect(canAccessRoute('/users', 'read-only')).toBe(false)
  })

  it('allows ui scope to access firewall', () => {
    expect(canAccessRoute('/firewall', 'ui')).toBe(true)
  })

  it('allows unknown routes for any user', () => {
    expect(canAccessRoute('/public', 'read-only')).toBe(true)
  })
})
