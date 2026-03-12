/**
 * Simple in-memory TTL cache with in-flight request deduplication.
 *
 * TTL guidelines:
 *  - skills:local     → 30s   (filesystem scan)
 *  - skills:installed → 60s   (clawhub lockfile)
 *  - skills:builtin   → 2min  (openclaw CLI)
 *  - skills:explore   → 5min  (remote registry)
 */

interface CacheEntry<T> {
  data: T
  expiry: number
  pending?: Promise<T>
}

const store = new Map<string, CacheEntry<unknown>>()

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const entry = store.get(key) as CacheEntry<T> | undefined

  // Return cached value if still fresh
  if (entry && entry.expiry > now && entry.data !== undefined) {
    return entry.data
  }

  // Deduplicate in-flight requests
  if (entry?.pending) {
    return entry.pending
  }

  const pending = fn().then(data => {
    store.set(key, { data, expiry: Date.now() + ttlMs })
    return data
  }).catch(err => {
    // Remove failed entry so next call retries
    store.delete(key)
    throw err
  })

  store.set(key, { data: undefined as unknown as T, expiry: 0, pending })
  return pending
}

export function invalidate(keyPrefix: string): void {
  const keys = Array.from(store.keys())
  for (const key of keys) {
    if (key.startsWith(keyPrefix)) {
      store.delete(key)
    }
  }
}
