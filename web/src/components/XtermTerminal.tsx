import { useEffect, useRef } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'

interface XtermTerminalProps {
  height?: number
}

export function XtermTerminal({ height = 420 }: XtermTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const term = new Terminal({
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor:     '#58a6ff',
        black:      '#484f58',
        red:        '#ff7b72',
        green:      '#3fb950',
        yellow:     '#d29922',
        blue:       '#58a6ff',
        magenta:    '#bc8cff',
        cyan:       '#39c5cf',
        white:      '#b1bac4',
        brightBlack:   '#6e7681',
        brightRed:     '#ffa198',
        brightGreen:   '#56d364',
        brightYellow:  '#e3b341',
        brightBlue:    '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan:    '#56d364',
        brightWhite:   '#f0f6fc',
      },
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 2000,
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(el)

    requestAnimationFrame(() => {
      fitAddon.fit()
    })

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const wsUrl  = `${proto}://${window.location.host}/ws/terminal`
    const ws     = new WebSocket(wsUrl)

    ws.onopen = () => {
      const dims = fitAddon.proposeDimensions()
      if (dims) {
        ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }))
      }
    }

    ws.onmessage = (e: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(e.data) as { type: string; data: string }
        if (msg.type === 'output') {
          term.write(msg.data)
        } else if (msg.type === 'exit') {
          term.writeln('\r\n\x1b[33m[session ended — refresh to reconnect]\x1b[0m')
        } else if (msg.type === 'error') {
          term.writeln(`\r\n\x1b[31m[error: ${msg.data}]\x1b[0m`)
        }
      } catch {
        term.write(e.data)
      }
    }

    ws.onerror  = () => term.writeln('\r\n\x1b[31m[WebSocket error — check auth]\x1b[0m')
    ws.onclose  = () => term.writeln('\r\n\x1b[33m[disconnected]\x1b[0m')

    term.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data)
    })

    const ro = new ResizeObserver(() => {
      fitAddon.fit()
      if (ws.readyState === WebSocket.OPEN) {
        const dims = fitAddon.proposeDimensions()
        if (dims) ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }))
      }
    })
    ro.observe(el)

    return () => {
      ws.close()
      term.dispose()
      ro.disconnect()
    }
  }, [])

  return (
    <div
      ref={containerRef}
      style={{
        height,
        width: '100%',
        background: '#0d1117',
        borderRadius: 6,
        overflow: 'hidden',
        padding: '6px 4px',
        boxSizing: 'border-box',
      }}
    />
  )
}
