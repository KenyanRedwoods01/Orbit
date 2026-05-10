import { useState, useEffect, useCallback } from 'react'

export const MAX_RETRIES = 20
export const RETRY_DELAY_MS = 1_500

export type SetupStatusResult = {
  setupRequired: boolean | null
  loading: boolean
  error: string | null
  retryCount: number
  retry: () => void
}

export type SetupStatusOptions = {
  maxRetries?: number
  retryDelayMs?: number
}

export function useSetupStatus(options: SetupStatusOptions = {}): SetupStatusResult {
  const maxRetries = options.maxRetries ?? MAX_RETRIES
  const retryDelayMs = options.retryDelayMs ?? RETRY_DELAY_MS

  const [setupRequired, setSetupRequired] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    let cancelled = false
    let attempts = 0

    async function check(): Promise<void> {
      if (cancelled) return
      try {
        const res = await fetch('/api/setup/status')
        if (!res.ok) throw new Error(`Server responded with ${res.status}`)
        const data: { setup_required?: boolean } = await res.json()
        if (typeof data?.setup_required !== 'boolean') {
          throw new Error('Unexpected response shape from /api/setup/status')
        }
        if (!cancelled) {
          setSetupRequired(data.setup_required)
          setLoading(false)
          setError(null)
        }
      } catch {
        if (cancelled) return
        attempts++
        setRetryCount(attempts)
        if (attempts >= maxRetries) {
          setLoading(false)
          setError(
            `Unable to reach the server after ${maxRetries} attempts. ` +
            'Please refresh the page or check that the backend is running.',
          )
          return
        }
        await new Promise<void>(resolve => setTimeout(resolve, retryDelayMs))
        void check()
      }
    }

    setLoading(true)
    setError(null)
    setRetryCount(0)
    setSetupRequired(null)
    void check()

    return () => {
      cancelled = true
    }
  }, [generation, maxRetries, retryDelayMs])

  const retry = useCallback(() => {
    setGeneration(g => g + 1)
  }, [])

  return { setupRequired, loading, error, retryCount, retry }
}
