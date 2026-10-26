import { useEffect, useState } from 'react'
import { errorMessage } from './api'
import { useAuth } from './auth'

export interface FetchState<T> {
  data: T | null
  error: string | null
  loading: boolean
}

/**
 * Fetch JSON from `url` as the logged-in user, re-fetching when it changes.
 * The previous data is kept while a new request is in flight, so charts
 * can dim instead of flashing empty. A 401 (e.g. an expired token) ends
 * the session, which sends the user back to the login page.
 */
export function useFetch<T>(url: string): FetchState<T> {
  const { session, endSession } = useAuth()
  const token = session?.token
  const [state, setState] = useState<FetchState<T>>({ data: null, error: null, loading: true })

  useEffect(() => {
    const controller = new AbortController()
    setState((s) => ({ ...s, loading: true, error: null }))

    fetch(url, { signal: controller.signal, headers: token ? { Authorization: `Bearer ${token}` } : undefined })
      .then(async (res) => {
        if (res.status === 401) endSession()
        if (!res.ok) throw new Error(await errorMessage(res))
        return res.json() as Promise<T>
      })
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setState((s) => ({ ...s, error: err.message, loading: false }))
      })

    return () => controller.abort()
  }, [url, token, endSession])

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
