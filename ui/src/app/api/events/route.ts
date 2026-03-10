/**
 * SSE endpoint — server-side singleton polling loop + multi-client broadcast.
 * Replaces client-side polling for health/agents/logs/usage data.
 */
import {
  fetchHealthData,
  fetchAgentsData,
  fetchLogsData,
  fetchUsageData,
  fetchMessagesData,
  fetchTasksData,
} from '@/lib/data-fetchers'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// ── Module-level singleton state ─────────────────────────────────

let pollingStarted = false
const clients = new Set<ReadableStreamDefaultController>()
const encoder = new TextEncoder()

function broadcast(event: string, data: unknown) {
  const msg = encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  Array.from(clients).forEach(c => {
    try {
      c.enqueue(msg)
    } catch {
      clients.delete(c)
    }
  })
}

function startPolling() {
  if (pollingStarted) return
  pollingStarted = true

  const poll = (fn: () => Promise<unknown>, event: string, intervalMs: number) => {
    const tick = async () => {
      if (clients.size === 0) return
      try {
        const data = await fn()
        broadcast(event, data)
      } catch {
        // Fetcher failed — skip this tick
      }
    }
    tick() // immediate first tick
    setInterval(tick, intervalMs)
  }

  poll(fetchHealthData, 'health', 20_000)
  poll(fetchAgentsData, 'agents', 15_000)
  poll(fetchLogsData, 'logs', 10_000)
  poll(fetchUsageData, 'usage', 60_000)
  poll(fetchMessagesData, 'messages', 15_000)
  poll(fetchTasksData, 'tasks', 10_000)
}

// ── GET handler ──────────────────────────────────────────────────

export async function GET() {
  startPolling()

  const stream = new ReadableStream({
    start(controller) {
      clients.add(controller)
      // Send a comment as keep-alive / connection confirmation
      controller.enqueue(encoder.encode(': connected\n\n'))
    },
    cancel() {
      // `this` is not the controller here — iterate to find and remove
      // The controller passed to start() is captured in the closure by the
      // ReadableStream internals; on cancel the stream is already closed.
      // We rely on the broadcast() catch block to clean up stale controllers.
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
