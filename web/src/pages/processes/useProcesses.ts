import { useState, useEffect, useCallback } from 'react'

export interface ProcessEntry {
  pid: number
  name: string
  cpu_pct: number
  mem_pct: number
  mem_rss: number
  virt_bytes: number
  status: string
  user: string
  ppid: number
  threads: number
  fds: number
  nice: number
  cmdline: string
  cwd: string
  // Computed / compat fields
  priority: number
  shr_bytes: number
  cpu_time: string
  started_at: string
  io_read_bps: number
  io_write_bps: number
  children_pids: number[]
}

export interface HistoryPoint {
  time: number
  cpu: number
  mem: number
  ioRead: number
  ioWrite: number
}

export function useProcesses() {
  const [processes, setProcesses] = useState<ProcessEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryPoint[]>([])

  const fetchProcesses = useCallback(async () => {
    try {
      const res = await fetch('/api/processes', { credentials: 'include' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const raw: ProcessEntry[] = await res.json()

      // Fill in compat fields not returned by the backend
      const enriched = raw.map(p => ({
        ...p,
        priority: p.nice + 20,
        shr_bytes: 0,
        cpu_time: '0:00',
        started_at: '',
        io_read_bps: 0,
        io_write_bps: 0,
        children_pids: [],
      }))

      setProcesses(enriched)
      setError(null)

      // Update history with aggregate CPU/mem
      const totalCPU = enriched.reduce((s, p) => s + p.cpu_pct, 0)
      const totalMem = enriched.length > 0
        ? enriched.reduce((s, p) => s + p.mem_pct, 0) / enriched.length
        : 0
      setHistory(prev => {
        const next = [...prev, { time: Date.now(), cpu: Math.min(totalCPU, 100), mem: totalMem, ioRead: 0, ioWrite: 0 }]
        return next.slice(-60)
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProcesses()
    const interval = setInterval(fetchProcesses, 3000)
    return () => clearInterval(interval)
  }, [fetchProcesses])

  const sendSignal = useCallback(async (pid: number, signal: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/processes/${pid}/signal`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal }),
      })
      return res.ok
    } catch {
      return false
    }
  }, [])

  const batchSignal = useCallback(async (pids: number[], signal: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/processes/batch-signal', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pids, signal }),
      })
      return res.ok
    } catch {
      return false
    }
  }, [])

  const renice = useCallback(async (pid: number, nice: number): Promise<boolean> => {
    try {
      const res = await fetch(`/api/processes/${pid}/nice`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nice }),
      })
      return res.ok
    } catch {
      return false
    }
  }, [])

  const getOpenFiles = useCallback(async (pid: number) => {
    try {
      const res = await fetch(`/api/processes/${pid}/files`, { credentials: 'include' })
      if (!res.ok) return null
      return res.json()
    } catch {
      return null
    }
  }, [])

  return {
    processes,
    loading,
    error,
    history,
    refresh: fetchProcesses,
    sendSignal,
    batchSignal,
    renice,
    getOpenFiles,
  }
}

// useProcessHistory returns per-second CPU/mem history for a specific PID.
// It piggy-backs on the global process list, extracting data points for the given pid.
export function useProcessHistory(pid: number) {
  const [history, setHistory] = useState<HistoryPoint[]>([])

  useEffect(() => {
    let cancelled = false

    const tick = async () => {
      try {
        const res = await fetch(`/api/processes/${pid}`, { credentials: 'include' })
        if (!res.ok || cancelled) return
        const p: ProcessEntry = await res.json()
        setHistory(prev => {
          const next = [...prev, { time: Date.now(), cpu: p.cpu_pct, mem: p.mem_pct, ioRead: p.io_read_bps, ioWrite: p.io_write_bps }]
          return next.slice(-120) // keep 2 minutes
        })
      } catch { /* ignore */ }
    }

    tick()
    const id = setInterval(tick, 2000)
    return () => { cancelled = true; clearInterval(id) }
  }, [pid])

  return history
}
