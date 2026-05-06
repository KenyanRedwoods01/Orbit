import { useEffect, useRef, useCallback } from 'react'

type MessageHandler = (data: unknown) => void

/**
 * useWebSocket connects to the given ws:// or wss:// URL and calls onMessage
 * for every received JSON message.
 *
 * The connection is automatically cleaned up when the component unmounts.
 */
export function useWebSocket(path: string, onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null)
  const handlerRef = useRef(onMessage)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unmountedRef = useRef(false)
  handlerRef.current = onMessage

  const connect = useCallback(() => {
    if (unmountedRef.current) return

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${proto}://${window.location.host}${path}`
    const ws = new WebSocket(url)

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data)
        handlerRef.current(data)
      } catch {
        // ignore malformed frames
      }
    }

    ws.onclose = () => {
      if (unmountedRef.current) return
      // Reconnect after 2s on unexpected close
      retryTimerRef.current = setTimeout(connect, 2_000)
    }

    wsRef.current = ws
  }, [path])

  useEffect(() => {
    unmountedRef.current = false
    connect()
    return () => {
      unmountedRef.current = true
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
      wsRef.current?.close()
    }
  }, [connect])
}
