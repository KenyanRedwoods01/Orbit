import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
})

// Stub window.matchMedia (jsdom does not implement it)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Stub ResizeObserver
globalThis.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Stub localStorage / sessionStorage for auth store
class FakeStorage implements Storage {
  private store: Record<string, string> = {}
  get length() { return Object.keys(this.store).length }
  key(n: number) { return Object.keys(this.store)[n] ?? null }
  getItem(k: string) { return this.store[k] ?? null }
  setItem(k: string, v: string) { this.store[k] = v }
  removeItem(k: string) { delete this.store[k] }
  clear() { this.store = {} }
}

Object.defineProperty(window, 'sessionStorage', { value: new FakeStorage() })
Object.defineProperty(window, 'localStorage',   { value: new FakeStorage() })
