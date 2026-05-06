import { useEffect, useState } from 'react'
import { fetchServerInfo, type ServerInfo } from './api'

export type { ServerInfo }

export function useServerInfo() {
  const [info, setInfo] = useState<ServerInfo | null>(null)

  useEffect(() => {
    fetchServerInfo()
      .then((d: ServerInfo) => setInfo(d))
      .catch(() => setInfo(null))
  }, [])

  return info
}
