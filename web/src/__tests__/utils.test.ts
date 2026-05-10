import { describe, it, expect } from 'vitest'

// ─── formatBytes ─────────────────────────────────────────────────────────────

function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`
}

describe('formatBytes', () => {
  it('returns 0 B for zero', () => {
    expect(formatBytes(0)).toBe('0 B')
  })
  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512 B')
  })
  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(2048)).toBe('2 KB')
  })
  it('formats megabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1 MB')
  })
  it('formats gigabytes', () => {
    expect(formatBytes(1024 ** 3)).toBe('1 GB')
  })
  it('respects decimal places', () => {
    expect(formatBytes(1536, 2)).toBe('1.5 KB')
  })
})

// ─── fmtRel (relative time) ───────────────────────────────────────────────────

function fmtRel(ts: number): string {
  if (!ts) return '—'
  const diff = Date.now() / 1000 - ts
  if (diff < 60)    return 'just now'
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

describe('fmtRel', () => {
  it('returns — for falsy timestamp', () => {
    expect(fmtRel(0)).toBe('—')
  })
  it('returns just now for very recent', () => {
    expect(fmtRel(Math.floor(Date.now() / 1000) - 10)).toBe('just now')
  })
  it('returns minutes ago', () => {
    expect(fmtRel(Math.floor(Date.now() / 1000) - 120)).toBe('2m ago')
  })
  it('returns hours ago', () => {
    expect(fmtRel(Math.floor(Date.now() / 1000) - 7200)).toBe('2h ago')
  })
  it('returns days ago', () => {
    expect(fmtRel(Math.floor(Date.now() / 1000) - 86400 * 3)).toBe('3d ago')
  })
})

// ─── slugify (URL-safe names) ─────────────────────────────────────────────────

function slugify(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

describe('slugify', () => {
  it('lowercases and replaces spaces', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })
  it('strips special characters', () => {
    expect(slugify('My Server!')).toBe('my-server')
  })
  it('collapses multiple hyphens', () => {
    expect(slugify('a   b')).toBe('a-b')
  })
  it('trims leading/trailing hyphens', () => {
    expect(slugify('  hello  ')).toBe('hello')
  })
  it('handles empty string', () => {
    expect(slugify('')).toBe('')
  })
})

// ─── clamp ───────────────────────────────────────────────────────────────────

function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max)
}

describe('clamp', () => {
  it('returns value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
  })
  it('clamps to min', () => {
    expect(clamp(-5, 0, 10)).toBe(0)
  })
  it('clamps to max', () => {
    expect(clamp(15, 0, 10)).toBe(10)
  })
  it('handles equal min/max', () => {
    expect(clamp(5, 7, 7)).toBe(7)
  })
})

// ─── truncate ────────────────────────────────────────────────────────────────

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - 3) + '...'
}

describe('truncate', () => {
  it('does not truncate short strings', () => {
    expect(truncate('hello', 10)).toBe('hello')
  })
  it('truncates long strings with ellipsis', () => {
    expect(truncate('hello world', 8)).toBe('hello...')
  })
  it('handles exact-length strings', () => {
    expect(truncate('hello', 5)).toBe('hello')
  })
  it('handles empty strings', () => {
    expect(truncate('', 5)).toBe('')
  })
})

// ─── parsePort ───────────────────────────────────────────────────────────────

function parsePort(s: string): number | null {
  const n = parseInt(s, 10)
  if (isNaN(n) || n < 1 || n > 65535) return null
  return n
}

describe('parsePort', () => {
  it('parses valid ports', () => {
    expect(parsePort('80')).toBe(80)
    expect(parsePort('443')).toBe(443)
    expect(parsePort('65535')).toBe(65535)
  })
  it('rejects 0 and negatives', () => {
    expect(parsePort('0')).toBeNull()
    expect(parsePort('-1')).toBeNull()
  })
  it('rejects port > 65535', () => {
    expect(parsePort('65536')).toBeNull()
  })
  it('rejects non-numeric', () => {
    expect(parsePort('http')).toBeNull()
    expect(parsePort('')).toBeNull()
  })
})
