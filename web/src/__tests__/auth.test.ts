import { describe, it, expect, beforeEach } from 'vitest'
import { useAuthStore } from '../store/auth'

describe('useAuthStore', () => {
  beforeEach(() => {
    // Reset store between tests
    useAuthStore.getState().logout()
  })

  it('starts with null user', () => {
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('setUser stores the user', () => {
    useAuthStore.getState().setUser({ username: 'alice', scope: 'admin' })
    expect(useAuthStore.getState().user).toEqual({ username: 'alice', scope: 'admin' })
  })

  it('logout clears the user', () => {
    useAuthStore.getState().setUser({ username: 'alice', scope: 'admin' })
    useAuthStore.getState().logout()
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('allows multiple setUser calls', () => {
    useAuthStore.getState().setUser({ username: 'alice', scope: 'admin' })
    useAuthStore.getState().setUser({ username: 'bob', scope: 'read-only' })
    expect(useAuthStore.getState().user?.username).toBe('bob')
  })
})
