import { describe, it, expect } from 'vitest'

// ─── Password strength heuristics ─────────────────────────────────────────────
// These match the logic expected by the ProfilePage password strength meter.

function passwordStrength(pw: string): 'weak' | 'fair' | 'strong' | 'very-strong' {
  let score = 0
  if (pw.length >= 8)  score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 1) return 'weak'
  if (score === 2) return 'fair'
  if (score === 3) return 'strong'
  return 'very-strong'
}

describe('passwordStrength', () => {
  it('returns weak for short passwords', () => {
    expect(passwordStrength('abc')).toBe('weak')
  })
  it('returns fair for moderate passwords', () => {
    expect(passwordStrength('password1')).toBe('fair')
  })
  it('returns very-strong for complex 8-char passwords with all criteria', () => {
    expect(passwordStrength('Pass1#ab')).toBe('very-strong')
  })
  it('returns very-strong for long complex passwords', () => {
    expect(passwordStrength('Str0ng#Pass2026!')).toBe('very-strong')
  })
})

// ─── IP validation (mirrors backend validateIP) ───────────────────────────────

function isValidIP(s: string): boolean {
  if (!s) return false
  // IPv4
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(s)) {
    return s.split('.').every(o => parseInt(o, 10) <= 255)
  }
  // IPv6 (simplified)
  if (/^[0-9a-fA-F:]+$/.test(s) && s.includes(':')) return true
  return false
}

describe('isValidIP', () => {
  it('accepts valid IPv4', () => {
    expect(isValidIP('192.168.1.1')).toBe(true)
    expect(isValidIP('10.0.0.1')).toBe(true)
    expect(isValidIP('127.0.0.1')).toBe(true)
  })
  it('rejects invalid IPv4', () => {
    expect(isValidIP('999.0.0.1')).toBe(false)
    expect(isValidIP('1.2.3')).toBe(false)
    expect(isValidIP('')).toBe(false)
  })
  it('accepts valid IPv6', () => {
    expect(isValidIP('::1')).toBe(true)
    expect(isValidIP('2001:db8::1')).toBe(true)
  })
  it('rejects non-IP strings', () => {
    expect(isValidIP('localhost')).toBe(false)
    expect(isValidIP('not-an-ip')).toBe(false)
  })
})

// ─── CIDR notation ───────────────────────────────────────────────────────────

function isValidCIDR(s: string): boolean {
  if (!s) return false
  const parts = s.split('/')
  if (parts.length !== 2) return false
  const prefixStr = parts[1]
  if (!/^\d+$/.test(prefixStr)) return false
  const prefix = parseInt(prefixStr, 10)
  const isIPv6 = parts[0].includes(':')
  const maxPrefix = isIPv6 ? 128 : 32
  if (prefix < 0 || prefix > maxPrefix) return false
  return isValidIP(parts[0])
}

describe('isValidCIDR', () => {
  it('accepts valid CIDR', () => {
    expect(isValidCIDR('192.168.0.0/24')).toBe(true)
    expect(isValidCIDR('10.0.0.0/8')).toBe(true)
  })
  it('rejects invalid prefix', () => {
    expect(isValidCIDR('192.168.0.0/33')).toBe(false)
    expect(isValidCIDR('192.168.0.0/x')).toBe(false)
  })
  it('rejects plain IP without prefix', () => {
    expect(isValidCIDR('192.168.0.1')).toBe(false)
  })
})

// ─── DB identifier validation (mirrors backend validateDBIdentifier) ──────────

function isValidDBIdentifier(name: string): boolean {
  if (!name || name.length > 128) return false
  return /^[A-Za-z_][A-Za-z0-9_$-]*$/.test(name)
}

describe('isValidDBIdentifier', () => {
  it('accepts simple identifiers', () => {
    expect(isValidDBIdentifier('mydb')).toBe(true)
    expect(isValidDBIdentifier('my_table')).toBe(true)
    expect(isValidDBIdentifier('_private')).toBe(true)
  })
  it('rejects identifiers starting with a digit', () => {
    expect(isValidDBIdentifier('1bad')).toBe(false)
  })
  it('rejects SQL injection', () => {
    expect(isValidDBIdentifier("'; DROP TABLE--")).toBe(false)
    expect(isValidDBIdentifier('bad name')).toBe(false)
  })
  it('rejects empty and too-long strings', () => {
    expect(isValidDBIdentifier('')).toBe(false)
    expect(isValidDBIdentifier('a'.repeat(129))).toBe(false)
  })
})
