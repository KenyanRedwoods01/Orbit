import { useEffect, useRef } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import { useWebSocket } from '@/hooks/useWebSocket'

interface LogTerminalProps {
  source: string | null
  height?: number
}

function colorize(line: string): string {
  if (/\b(ERROR|FATAL|CRIT|CRITICAL|emerg|alert|crit|err)\b/i.test(line))
    return `\x1b[31m${line}\x1b[0m`
  if (/\b(WARN|WARNING|warn)\b/i.test(line))
    return `\x1b[33m${line}\x1b[0m`
  if (/\b(INFO|NOTICE|info|notice)\b/i.test(line))
    return `\x1b[32m${line}\x1b[0m`
  if (/\b(DEBUG|TRACE|debug|trace)\b/i.test(line))
    return `\x1b[90m${line}\x1b[0m`
  return line
}

export function LogTerminal({ source, height = 500 }: LogTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      theme: {
        background: '#0c0e14',
        foreground: '#e2e4ed',
        cursor: '#4a9eff',
        cursorAccent: '#0f1117',
        selectionBackground: 'rgba(74, 158, 255, 0.25)',
        black: '#1a1d27',
        brightBlack: '#4a4e5e',
      },
      fontSize: 12,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      lineHeight: 1.45,
      convertEol: true,
      scrollback: 10000,
      cursorBlink: true,
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    // Defer fit until after xterm renderer has fully initialised
    requestAnimationFrame(() => {
      try { fit.fit() } catch { /* ignore if already disposed */ }
    })

    term.writeln('\x1b[90m─── Orbit log stream ─── \x1b[0m')
    if (!source) {
      term.writeln('\x1b[90mSelect a log source to begin streaming.\x1b[0m')
    }

    termRef.current = term
    fitRef.current = fit

    const ro = new ResizeObserver(() => fit.fit())
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [source])

  useWebSocket(source ? `/ws/logs?source=${encodeURIComponent(source)}` : '/ws/logs', (raw) => {
    if (!source || !termRef.current) return
    const msg = raw as { type?: string; payload?: string }
    const line = msg.type === 'log' ? (msg.payload ?? '') : String(raw)
    termRef.current.writeln(colorize(line))
  })

  return (
    <div
      ref={containerRef}
      style={{
        height,
        background: '#0c0e14',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        border: '1px solid var(--color-border)',
      }}
    />
  )
}
