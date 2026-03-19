/**
 * base-rules.ts — 解析 config/base-rules.md 并注入到 Agent 的 AGENTS.md / SOUL.md
 *
 * 委托 core/common/base-rules-injector.cjs 实现。
 * UI 层保留接口签名以避免大规模调用者改动。
 */

import core from '@/lib/core-bridge'

export interface BaseRules {
  agentsRules: string
  soulRules: string
  reminder: string
}

export function parseBaseRules(raw: string): BaseRules {
  return core.common.baseRulesInjector.parseBaseRules(raw)
}

export function stripMarkerBlock(content: string, startMarker: string, endMarker: string): string {
  return core.common.baseRulesInjector.stripMarkerBlock(content, startMarker, endMarker)
}

export function injectIntoAgentsMd(content: string, agentsRules: string, reminder: string): string {
  return core.common.baseRulesInjector.injectIntoAgentsMd(content, agentsRules, reminder)
}

export function injectIntoSoulMd(content: string, soulRules: string): string {
  return core.common.baseRulesInjector.injectIntoSoulMd(content, soulRules)
}

export function injectBaseRulesForAgent(agentDir: string): void {
  return core.common.baseRulesInjector.injectBaseRulesForAgent(agentDir)
}
