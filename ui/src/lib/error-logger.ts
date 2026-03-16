/**
 * Centralized error logger for UI components and API routes.
 * Replaces empty catch blocks with structured console.error output.
 */
export function logError(context: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`[af:${context}]`, message)
}
