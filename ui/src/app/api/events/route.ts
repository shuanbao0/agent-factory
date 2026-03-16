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
  fetchCostsData,
  fetchAlertsData,
  fetchAutopilotStatusData,
  fetchAutopilotDeptsData,
  fetchBudgetStatusData,
} from '@/lib/data-fetchers'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// ── Module-level singleton state ─────────────────────────────────

let pollingStarted = false
const clients = new Set<ReadableStreamDefaultController>()
const encoder = new TextEncoder()
const intervalIds: NodeJS.Timeout[] = []

function stopPolling() {
  for (const id of intervalIds) clearInterval(id)
  intervalIds.length = 0
  pollingStarted = false
}

function broadcast(event: string, data: unknown) {
  const msg = encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  for (const c of Array.from(clients)) {
    try {
      c.enqueue(msg)
    } catch {
      clients.delete(c)
    }
  }
  // Stop polling when no clients remain
  if (clients.size === 0) stopPolling()
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
    intervalIds.push(setInterval(tick, intervalMs))
  }

  poll(fetchHealthData, 'health', 20_000)
  poll(fetchAgentsData, 'agents', 15_000)
  poll(fetchLogsData, 'logs', 10_000)
  poll(fetchUsageData, 'usage', 60_000)
  poll(fetchMessagesData, 'messages', 15_000)
  poll(fetchTasksData, 'tasks', 10_000)
  poll(fetchCostsData, 'costs', 30_000)
  poll(fetchAlertsData, 'alerts', 10_000)
  poll(fetchAutopilotStatusData, 'autopilot', 5_000)
  poll(fetchAutopilotDeptsData, 'departments', 10_000)
  poll(fetchBudgetStatusData, 'budget', 15_000)
}

// ── GET handler ──────────────────────────────────────────────────

export async function GET() {
  let controller: ReadableStreamDefaultController

  const stream = new ReadableStream({
    start(c) {
      controller = c
      clients.add(controller)
      // Send a comment as keep-alive / connection confirmation
      controller.enqueue(encoder.encode(': connected\n\n'))
      startPolling()
    },
    cancel() {
      clients.delete(controller)
      if (clients.size === 0) stopPolling()
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
