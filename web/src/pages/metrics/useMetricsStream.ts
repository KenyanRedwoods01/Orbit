import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchMetrics, fetchMetricsHistory } from '@/lib/api'
import type { MetricsSnapshot } from '@/lib/api'
import { useWebSocket } from '@/hooks/useWebSocket'

export interface MetricPoint {
  time: number
  cpu: number
  mem: number
  netSent: number
  netRecv: number
}

const RANGE_MS: Record<string, number> = {
  '5m':  5  * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h':  60 * 60 * 1000,
  '6h':  6  * 60 * 60 * 1000,
}

const RANGE_LIMIT: Record<string, number> = {
  '5m':  30,
  '15m': 60,
  '1h':  120,
  '6h':  720,
}

function snapToPoint(snap: MetricsSnapshot): MetricPoint {
  return {
    time:    snap.time ? new Date(snap.time).getTime() : Date.now(),
    cpu:     snap.cpu.total_pct,
    mem:     snap.memory.used_pct,
    netSent: snap.network?.reduce((s, n) => s + n.sent_bps, 0) ?? 0,
    netRecv: snap.network?.reduce((s, n) => s + n.recv_bps, 0) ?? 0,
  }
}

// ── Demo data generator ──────────────────────────────────────
let _demoT = 0

function demoSnap(): MetricsSnapshot {
  _demoT += 0.06
  const cpu  = 20 + 38 * Math.abs(Math.sin(_demoT * 0.7)) + 8 * Math.random()
  const mem  = 52 + 12 * Math.sin(_demoT * 0.18) + 3 * Math.random()
  const disk = 64 + 2 * Math.sin(_demoT * 0.05)
  const sent = (100 + 900 * Math.abs(Math.sin(_demoT * 1.1))) * 1024
  const recv = (200 + 1500 * Math.abs(Math.sin(_demoT * 0.8 + 1))) * 1024
  return {
    time: new Date().toISOString(),
    cpu: {
      total_pct: +cpu.toFixed(2),
      per_core_pct: Array.from({ length: 4 }, (_, i) =>
        +(cpu * (0.7 + 0.6 * Math.abs(Math.sin(_demoT + i)))).toFixed(1)
      ),
    },
    memory: {
      used_pct:        +mem.toFixed(2),
      used_bytes:      Math.round(mem / 100 * 16 * 1024 * 1024 * 1024),
      total_bytes:     16 * 1024 * 1024 * 1024,
      swap_used_bytes: 0,
      swap_total_bytes: 0,
    },
    disk: [
      {
        mount: '/', device: '/dev/sda1',
        used_pct:    +disk.toFixed(1),
        used_bytes:  Math.round(disk / 100 * 500e9),
        total_bytes: 500e9,
        read_bps:    50e3 * Math.random(),
        write_bps:   20e3 * Math.random(),
      },
    ],
    network: [
      { iface: 'eth0', bytes_sent: 0, bytes_recv: 0, sent_bps: sent, recv_bps: recv },
    ],
    processes: [],
  }
}

// ── Hook ─────────────────────────────────────────────────────
export function useMetricsStream(range = '15m') {
  const [snapshot, setSnapshot] = useState<MetricsSnapshot | null>(null)
  const [buffer,   setBuffer]   = useState<MetricPoint[]>([])
  const [wsLive,   setWsLive]   = useState(false)
  const demoRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const rangeMs  = RANGE_MS[range]  ?? RANGE_MS['15m']
  const maxLimit = RANGE_LIMIT[range] ?? 60

  const { data: restSnap } = useQuery({
    queryKey: ['metrics', 'snapshot'],
    queryFn:  fetchMetrics,
    refetchInterval: wsLive ? false : 3000,
    retry: false,
  })

  // Fetch stored history whenever range changes
  const { data: historyData } = useQuery({
    queryKey: ['metrics', 'history', range],
    queryFn:  () => {
      const now  = Date.now()
      const from = now - rangeMs
      return fetchMetricsHistory(from, now, maxLimit)
    },
    refetchInterval: 30_000,
    staleTime: 0,
    retry: false,
  })

  // Pre-populate buffer from history
  useEffect(() => {
    if (!historyData || historyData.length === 0) return
    const pts = historyData.map(snapToPoint)
    setBuffer(pts)
    if (!wsLive) {
      setSnapshot(historyData[historyData.length - 1])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyData])

  useEffect(() => {
    if (restSnap && !wsLive) setSnapshot(restSnap)
  }, [restSnap, wsLive])

  // Start demo after 2 s if no real data arrived
  useEffect(() => {
    const kickoff = setTimeout(() => {
      if (demoRef.current) return
      demoRef.current = setInterval(() => {
        setSnapshot(prev => {
          if (prev !== null && (prev as { _wsLive?: boolean })._wsLive) {
            if (demoRef.current) { clearInterval(demoRef.current); demoRef.current = null }
            return prev
          }
          return demoSnap()
        })
        setBuffer(prev => {
          const snap = demoSnap()
          return [...prev, snapToPoint(snap)].slice(-maxLimit)
        })
      }, 1500)
    }, 2000)

    return () => {
      clearTimeout(kickoff)
      if (demoRef.current) { clearInterval(demoRef.current); demoRef.current = null }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (wsLive && demoRef.current) {
      clearInterval(demoRef.current)
      demoRef.current = null
    }
  }, [wsLive])

  useWebSocket('/ws/metrics', (raw) => {
    const msg  = raw as { type?: string; payload?: MetricsSnapshot }
    const snap = msg.type === 'metrics' ? (msg.payload ?? null) : (raw as MetricsSnapshot)
    if (!snap?.cpu) return
    setWsLive(true)
    setSnapshot(snap)
    setBuffer(prev => {
      return [...prev, snapToPoint(snap)].slice(-maxLimit)
    })
  })

  return { snapshot: snapshot ?? restSnap ?? null, buffer, wsLive }
}
