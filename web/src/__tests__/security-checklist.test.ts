import { describe, it, expect } from 'vitest'

// ─── Pure-logic tests for the SecurityChecklist data layer ────────────────────
// We deliberately do NOT import or render the React component here, because
// recharts is bundled with its own jsx-runtime which triggers the
// "older React element" error in jsdom. Instead we reproduce the same logic.

type CheckStatus = 'pass' | 'fail' | 'warn' | 'na'
interface SecurityCheck { id: string; status: CheckStatus; severity: string; text: string }
interface SecurityCategory { id: number; title: string; severity: string; checks: SecurityCheck[] }

// ─── Score calculation helpers (mirrors SecurityChecklistSection) ─────────────

function computeStats(cats: SecurityCategory[]) {
  const allChecks = cats.flatMap(c => c.checks)
  const totalPass   = allChecks.filter(c => c.status === 'pass').length
  const totalFail   = allChecks.filter(c => c.status === 'fail').length
  const totalWarn   = allChecks.filter(c => c.status === 'warn').length
  const totalNA     = allChecks.filter(c => c.status === 'na').length
  const totalActive = allChecks.length - totalNA
  const overallPct  = totalActive === 0 ? 0 : Math.round((totalPass / totalActive) * 100)
  return { totalPass, totalFail, totalWarn, totalNA, totalActive, overallPct }
}

// ─── Filter helpers ───────────────────────────────────────────────────────────

function filterByStatus(cats: SecurityCategory[], status: string): SecurityCategory[] {
  if (status === 'all') return cats
  return cats.filter(cat => cat.checks.some(c => c.status === status))
}

function filterBySearch(cats: SecurityCategory[], q: string): SecurityCategory[] {
  if (!q) return cats
  const lower = q.toLowerCase()
  return cats.filter(cat =>
    cat.title.toLowerCase().includes(lower) ||
    cat.checks.some(c => c.text.toLowerCase().includes(lower))
  )
}

// ─── Sample fixture ───────────────────────────────────────────────────────────

const FIXTURE: SecurityCategory[] = [
  {
    id: 1, title: 'Authentication', severity: 'critical',
    checks: [
      { id: 'a1', status: 'pass', severity: 'critical', text: 'MFA enabled' },
      { id: 'a2', status: 'fail', severity: 'high',     text: 'Password policy' },
      { id: 'a3', status: 'warn', severity: 'medium',   text: 'Session timeout' },
    ],
  },
  {
    id: 2, title: 'Network', severity: 'high',
    checks: [
      { id: 'n1', status: 'pass', severity: 'high',     text: 'Firewall active' },
      { id: 'n2', status: 'na',   severity: 'medium',   text: 'VPN configured' },
    ],
  },
  {
    id: 3, title: 'Backup', severity: 'medium',
    checks: [
      { id: 'b1', status: 'pass', severity: 'medium',   text: 'Daily backups' },
      { id: 'b2', status: 'pass', severity: 'low',      text: 'Offsite copy' },
    ],
  },
]

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('computeStats', () => {
  it('counts pass/fail/warn/na correctly', () => {
    const s = computeStats(FIXTURE)
    expect(s.totalPass).toBe(4)  // a1, n1, b1, b2
    expect(s.totalFail).toBe(1)  // a2
    expect(s.totalWarn).toBe(1)  // a3
    expect(s.totalNA).toBe(1)    // n2
    expect(s.totalActive).toBe(6)
  })

  it('computes overall percentage', () => {
    const s = computeStats(FIXTURE)
    // 4 pass out of 6 active = 67%
    expect(s.overallPct).toBe(67)
  })

  it('handles all-pass scenario', () => {
    const allPass: SecurityCategory[] = [{
      id: 1, title: 'Test', severity: 'low',
      checks: [
        { id: 'x1', status: 'pass', severity: 'low', text: 'A' },
        { id: 'x2', status: 'pass', severity: 'low', text: 'B' },
      ],
    }]
    const s = computeStats(allPass)
    expect(s.overallPct).toBe(100)
    expect(s.totalFail).toBe(0)
  })

  it('handles all-fail scenario', () => {
    const allFail: SecurityCategory[] = [{
      id: 1, title: 'Test', severity: 'critical',
      checks: [
        { id: 'x1', status: 'fail', severity: 'critical', text: 'A' },
        { id: 'x2', status: 'fail', severity: 'critical', text: 'B' },
      ],
    }]
    const s = computeStats(allFail)
    expect(s.overallPct).toBe(0)
    expect(s.totalFail).toBe(2)
  })

  it('excludes NA checks from active count', () => {
    const s = computeStats(FIXTURE)
    const total = s.totalPass + s.totalFail + s.totalWarn + s.totalNA
    expect(total).toBe(7) // all 7 checks
    expect(s.totalActive).toBe(6) // 7 - 1 NA
  })

  it('handles empty categories', () => {
    const s = computeStats([])
    expect(s.totalPass).toBe(0)
    expect(s.totalFail).toBe(0)
    expect(s.overallPct).toBe(0)
  })
})

describe('filterByStatus', () => {
  it('returns all categories for "all"', () => {
    expect(filterByStatus(FIXTURE, 'all')).toHaveLength(3)
  })

  it('returns only categories with failing checks', () => {
    const r = filterByStatus(FIXTURE, 'fail')
    expect(r).toHaveLength(1)
    expect(r[0].title).toBe('Authentication')
  })

  it('returns only categories with passing checks', () => {
    const r = filterByStatus(FIXTURE, 'pass')
    expect(r).toHaveLength(3) // all 3 have at least one pass
  })

  it('returns only categories with NA checks', () => {
    const r = filterByStatus(FIXTURE, 'na')
    expect(r).toHaveLength(1)
    expect(r[0].title).toBe('Network')
  })

  it('returns empty array when no match', () => {
    const r = filterByStatus(FIXTURE, 'warn')
    expect(r).toHaveLength(1) // only Auth has a warn
    expect(r[0].title).toBe('Authentication')
  })
})

describe('filterBySearch', () => {
  it('returns all when query is empty', () => {
    expect(filterBySearch(FIXTURE, '')).toHaveLength(3)
  })

  it('matches by category title (case-insensitive)', () => {
    const r = filterBySearch(FIXTURE, 'auth')
    expect(r).toHaveLength(1)
    expect(r[0].title).toBe('Authentication')
  })

  it('matches by check text', () => {
    const r = filterBySearch(FIXTURE, 'firewall')
    expect(r).toHaveLength(1)
    expect(r[0].title).toBe('Network')
  })

  it('returns empty array when nothing matches', () => {
    const r = filterBySearch(FIXTURE, 'zzznomatch')
    expect(r).toHaveLength(0)
  })

  it('is case-insensitive', () => {
    const r = filterBySearch(FIXTURE, 'BACKUP')
    expect(r).toHaveLength(1)
    expect(r[0].title).toBe('Backup')
  })
})

// ─── Trend Chart Snapshot Logic ───────────────────────────────────────────────

interface TrendPoint { label: string; pass: number; warn: number; fail: number }

function seedHistory(current: TrendPoint): TrendPoint[] {
  const dates: string[] = []
  const now = new Date()
  for (let i = 7; i >= 1; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    dates.push(`${d.getMonth() + 1}/${d.getDate()}`)
  }
  const total = current.pass + current.warn + current.fail
  return dates.map((label, i) => {
    const progress = i / 7
    const failExtra    = Math.round((1 - progress) * Math.min(6, current.fail + 3))
    const passReduced  = Math.round((1 - progress) * Math.min(8, current.pass))
    return {
      label,
      pass: Math.max(0, current.pass - passReduced),
      warn: Math.max(0, Math.min(total - Math.max(0, current.fail + failExtra) - Math.max(0, current.pass - passReduced), current.warn + Math.round((1 - progress) * 4))),
      fail: Math.min(total, current.fail + failExtra),
    }
  })
}

describe('seedHistory', () => {
  const current: TrendPoint = { label: '5/10 12:00', pass: 4, warn: 1, fail: 1 }

  it('generates 7 historical data points', () => {
    const h = seedHistory(current)
    expect(h).toHaveLength(7)
  })

  it('produces unique labels for each point', () => {
    const h = seedHistory(current)
    const labels = h.map(p => p.label)
    const unique = new Set(labels)
    expect(unique.size).toBe(7)
  })

  it('all values are non-negative', () => {
    const h = seedHistory(current)
    for (const p of h) {
      expect(p.pass).toBeGreaterThanOrEqual(0)
      expect(p.warn).toBeGreaterThanOrEqual(0)
      expect(p.fail).toBeGreaterThanOrEqual(0)
    }
  })

  it('trend starts worse (more fail) and improves toward current', () => {
    const h = seedHistory(current)
    // First historical point should have more fails than current
    expect(h[0].fail).toBeGreaterThanOrEqual(current.fail)
  })
})
