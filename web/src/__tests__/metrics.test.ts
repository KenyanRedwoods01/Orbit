import { describe, it, expect } from 'vitest'

// ─── Metrics utility tests (Level 2) ─────────────────────────────────────────

function formatCPU(pct: number): string {
  return `${pct.toFixed(1)}%`
}

function formatMemory(usedBytes: number, totalBytes: number): string {
  const usedGB = usedBytes / (1024 ** 3)
  const totalGB = totalBytes / (1024 ** 3)
  return `${usedGB.toFixed(1)} / ${totalGB.toFixed(1)} GB`
}

function formatNetworkBps(bps: number): string {
  if (bps < 1024)         return `${bps.toFixed(0)} B/s`
  if (bps < 1024 * 1024)  return `${(bps / 1024).toFixed(1)} KB/s`
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`
}

function cpuStatus(pct: number): 'normal' | 'warning' | 'critical' {
  if (pct >= 90) return 'critical'
  if (pct >= 70) return 'warning'
  return 'normal'
}

function memStatus(usedPct: number): 'normal' | 'warning' | 'critical' {
  if (usedPct >= 90) return 'critical'
  if (usedPct >= 80) return 'warning'
  return 'normal'
}

describe('formatCPU', () => {
  it('formats percentage with one decimal', () => {
    expect(formatCPU(45.678)).toBe('45.7%')
  })
  it('formats zero', () => {
    expect(formatCPU(0)).toBe('0.0%')
  })
  it('formats 100%', () => {
    expect(formatCPU(100)).toBe('100.0%')
  })
})

describe('formatMemory', () => {
  it('shows used/total in GB', () => {
    const gb = 1024 ** 3
    expect(formatMemory(2 * gb, 8 * gb)).toBe('2.0 / 8.0 GB')
  })
  it('handles sub-GB values', () => {
    expect(formatMemory(512 * 1024 * 1024, 1024 ** 3)).toBe('0.5 / 1.0 GB')
  })
})

describe('formatNetworkBps', () => {
  it('formats bytes per second', () => {
    expect(formatNetworkBps(512)).toBe('512 B/s')
  })
  it('formats kilobytes per second', () => {
    expect(formatNetworkBps(2048)).toBe('2.0 KB/s')
  })
  it('formats megabytes per second', () => {
    expect(formatNetworkBps(5 * 1024 * 1024)).toBe('5.0 MB/s')
  })
})

describe('cpuStatus', () => {
  it('normal below 70%', () => {
    expect(cpuStatus(50)).toBe('normal')
    expect(cpuStatus(69)).toBe('normal')
  })
  it('warning between 70-89%', () => {
    expect(cpuStatus(70)).toBe('warning')
    expect(cpuStatus(89)).toBe('warning')
  })
  it('critical at 90%+', () => {
    expect(cpuStatus(90)).toBe('critical')
    expect(cpuStatus(100)).toBe('critical')
  })
})

describe('memStatus', () => {
  it('normal below 80%', () => {
    expect(memStatus(50)).toBe('normal')
  })
  it('warning between 80-89%', () => {
    expect(memStatus(80)).toBe('warning')
    expect(memStatus(89)).toBe('warning')
  })
  it('critical at 90%+', () => {
    expect(memStatus(95)).toBe('critical')
  })
})

// ─── Metric aggregation helpers ───────────────────────────────────────────────

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function peak(values: number[]): number {
  if (values.length === 0) return 0
  return Math.max(...values)
}

describe('average', () => {
  it('calculates average of values', () => {
    expect(average([1, 2, 3, 4, 5])).toBe(3)
  })
  it('returns 0 for empty array', () => {
    expect(average([])).toBe(0)
  })
  it('handles single value', () => {
    expect(average([42])).toBe(42)
  })
})

describe('peak', () => {
  it('returns maximum value', () => {
    expect(peak([10, 40, 25, 60, 30])).toBe(60)
  })
  it('returns 0 for empty array', () => {
    expect(peak([])).toBe(0)
  })
})
