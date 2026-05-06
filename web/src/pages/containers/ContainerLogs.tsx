import { useEffect, useRef } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { useWebSocket } from '@/hooks/useWebSocket'

interface ContainerLogsProps {
  containerId: string
  containerName: string
}

export function ContainerLogs({ containerId, containerName }: ContainerLogsProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      theme: {
        background: '#0c0e14',
        foreground: '#e2e4ed',
        cursor: '#4a9eff',
        selectionBackground: 'rgba(74,158,255,0.25)',
      },
      fontSize: 12,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      lineHeight: 1.45,
      convertEol: true,
      scrollback: 5000,
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    // Defer fit until after xterm renderer has fully initialised
    requestAnimationFrame(() => {
      try { fit.fit() } catch { /* ignore if already disposed */ }
    })
    term.writeln(`\x1b[90m─── ${containerName} logs ───\x1b[0m`)
    termRef.current = term

    const ro = new ResizeObserver(() => fit.fit())
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      term.dispose()
      termRef.current = null
    }
  }, [containerId, containerName])

  useWebSocket(`/ws/containers/${containerId}/logs`, (raw) => {
    const msg = raw as { type?: string; payload?: string }
    const line = msg.type === 'log' ? (msg.payload ?? '') : String(raw)
    termRef.current?.writeln(line)
  })

  return (
    <div
      ref={containerRef}
      style={{
        height: 260,
        background: '#0c0e14',
        borderTop: '1px solid var(--color-border)',
      }}
    />
  )
}
