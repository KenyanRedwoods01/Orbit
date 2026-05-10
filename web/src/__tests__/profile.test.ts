import { describe, it, expect } from 'vitest'

// ─── Profile security score calculation (mirrors ProfilePage logic) ───────────

interface TOTPStatus { enabled: boolean; backup_codes_left: number }
interface ProfileRecord {
  email: string
  display_name: string
  bio: string
  totp_enabled: boolean
  backup_codes_left: number
}

function calcSecScore(profile: Partial<ProfileRecord>, totpStatus?: Partial<TOTPStatus>): number {
  let score = 0
  if (totpStatus?.enabled)                          score += 40
  if ((totpStatus?.backup_codes_left ?? 0) > 0)    score += 20
  if (profile.email)                                score += 15
  if (profile.display_name)                         score += 15
  if (profile.bio)                                  score += 10
  return score
}

describe('calcSecScore', () => {
  it('returns 0 for a completely empty profile', () => {
    expect(calcSecScore({}, {})).toBe(0)
  })

  it('gives 40 points for having 2FA enabled', () => {
    expect(calcSecScore({}, { enabled: true })).toBe(40)
  })

  it('gives 20 points for backup codes', () => {
    expect(calcSecScore({}, { enabled: false, backup_codes_left: 5 })).toBe(20)
  })

  it('gives 15 points for email', () => {
    expect(calcSecScore({ email: 'user@example.com' }, {})).toBe(15)
  })

  it('gives 15 points for display name', () => {
    expect(calcSecScore({ display_name: 'Alice' }, {})).toBe(15)
  })

  it('gives 10 points for bio', () => {
    expect(calcSecScore({ bio: 'Server admin' }, {})).toBe(10)
  })

  it('returns 100 for a fully complete profile', () => {
    const profile = { email: 'a@b.com', display_name: 'Alice', bio: 'Admin' }
    const totp = { enabled: true, backup_codes_left: 8 }
    expect(calcSecScore(profile, totp)).toBe(100)
  })

  it('handles undefined totpStatus', () => {
    expect(calcSecScore({ email: 'x@y.com' })).toBe(15)
  })
})

// ─── Avatar initials logic (mirrors ProfilePage) ──────────────────────────────

function getInitials(displayName?: string, username?: string): string {
  const source = displayName || username || '?'
  return source.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
}

describe('getInitials', () => {
  it('uses first letters of display name words', () => {
    expect(getInitials('Alice Bob', 'alice')).toBe('AB')
  })
  it('uses single letter for single word', () => {
    expect(getInitials('Alice', 'alice')).toBe('A')
  })
  it('falls back to username when no display name', () => {
    expect(getInitials(undefined, 'charlie')).toBe('C')
  })
  it('uses ? when neither is provided', () => {
    expect(getInitials(undefined, undefined)).toBe('?')
  })
  it('caps at 2 characters', () => {
    expect(getInitials('Alice Bob Charlie')).toBe('AB')
  })
  it('uppercases results', () => {
    expect(getInitials('alice bob')).toBe('AB')
  })
})

// ─── Session display helpers ──────────────────────────────────────────────────

function isSessionExpired(expiresAt: number): boolean {
  return expiresAt < Date.now() / 1000
}

describe('isSessionExpired', () => {
  it('returns true for past timestamps', () => {
    expect(isSessionExpired(1000)).toBe(true)
  })
  it('returns false for future timestamps', () => {
    const future = Math.floor(Date.now() / 1000) + 3600
    expect(isSessionExpired(future)).toBe(false)
  })
})

// ─── Password strength (matches ProfilePage.pwStrength) ───────────────────────

function pwStrength(pw: string): { score: number; label: string } {
  let score = 0
  if (pw.length >= 8)          score++
  if (pw.length >= 12)         score++
  if (/[A-Z]/.test(pw))        score++
  if (/[0-9]/.test(pw))        score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 1) return { score, label: 'Weak' }
  if (score <= 2) return { score, label: 'Fair' }
  if (score <= 3) return { score, label: 'Good' }
  if (score <= 4) return { score, label: 'Strong' }
  return { score, label: 'Very Strong' }
}

describe('pwStrength', () => {
  it('labels very short password as Weak', () => {
    expect(pwStrength('abc').label).toBe('Weak')
  })
  it('labels moderate password as Fair', () => {
    expect(pwStrength('password1').label).toBe('Fair')
  })
  it('labels long complex password as Very Strong', () => {
    expect(pwStrength('Str0ng#Pass2026!').label).toBe('Very Strong')
  })
  it('score is 0 for empty string', () => {
    expect(pwStrength('').score).toBe(0)
  })
  it('adds point for special character', () => {
    const noSpecial = pwStrength('Password1')
    const withSpecial = pwStrength('Password1!')
    expect(withSpecial.score).toBeGreaterThan(noSpecial.score)
  })
})
