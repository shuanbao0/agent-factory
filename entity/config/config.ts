/**
 * Gateway configuration types — openclaw.json structure.
 */

export interface OpenClawModelEntry {
  id: string
  name: string
  reasoning?: boolean
  input?: string[]
  cost?: { input: number; output: number; cacheRead: number; cacheWrite: number }
  contextWindow?: number
  maxTokens?: number
}

export interface OpenClawProviderConfig {
  apiKey?: string
  baseUrl?: string
  api?: string
  models?: OpenClawModelEntry[]
  [key: string]: unknown
}

export interface OpenClawConfig {
  models?: {
    providers?: Record<string, OpenClawProviderConfig>
    [key: string]: unknown
  }
  agents?: {
    list?: import('../agent/agent').AgentConfigEntry[]
    defaults?: {
      model?: { primary?: string; [key: string]: unknown }
      models?: Record<string, { alias: string }>
      [key: string]: unknown
    }
    [key: string]: unknown
  }
  plugins?: {
    entries?: Record<string, unknown>
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface GatewayConfig {
  port: number
  token: string
}
