import { useEffect, useState } from 'react'

export interface FetchState<T> {
  data: T | null
  error: string | null
  loading: boolean
}

/**
 * Fetch JSON from `url`, re-fetching when it changes.
 * The previous data is kept while a new request is in flight, so charts
 * can dim instead of flashing empty.
 */
export function useFetch<T>(url: string): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({ data: null, error: null, loading: true })

  useEffect(() => {
    const controller = new AbortController()
    setState((s) => ({ ...s, loading: true, error: null }))

    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(body?.detail ?? `Request failed (${res.status})`)
        }
        return res.json() as Promise<T>
      })
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setState((s) => ({ ...s, error: err.message, loading: false }))
      })

    return () => controller.abort()
  }, [url])

  return state
}

/** `value`, but only after it has stopped changing for `delayMs`. */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}
