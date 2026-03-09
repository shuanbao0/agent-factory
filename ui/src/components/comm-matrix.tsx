'use client'
import { useState } from 'react'
import { useTranslation } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Check, X, Loader2, Wand2 } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────
interface Agent {
  id: string
  role: string
  name: string
}

interface CommMatrixProps {
  agents: Agent[]
  /** Current permissions: agentId → set of allowed peer ids */
  permissions: Record<string, Set<string>>
  /** Called when a permission is toggled */
  onToggle: (fromId: string, toId: string, allowed: boolean) => void
  /** Called when a preset template is applied */
  onApplyTemplate: (template: CommTemplate) => void
  saving?: boolean
}

export type CommTemplate = 'pipeline' | 'star' | 'full' | 'none'

const ROLE_EMOJI: Record<string, string> = {
  pm: '📋', product: '📦', designer: '🎨', frontend: '💻',
  backend: '⚙️', tester: '🧪', researcher: '🔬',
  ceo: '👔', marketing: '📣', analyst: '📊', writer: '✍️',
}

/**
 * Generate permissions for a given template.
 *
 * - pipeline: PM → Researcher → Product → Designer → Frontend → Backend → Tester
 * - star: PM can talk to everyone, others only to PM
 * - full: everyone can talk to everyone
 * - none: no connections
 */
export function generateTemplate(agents: Agent[], template: CommTemplate): Record<string, Set<string>> {
  const result: Record<string, Set<string>> = {}
  for (const a of agents) result[a.id] = new Set()

  if (template === 'none') return result
  if (template === 'full') {
    for (const a of agents) {
      for (const b of agents) {
        if (a.id !== b.id) result[a.id].add(b.id)
      }
    }
    return result
  }

  // Role-based ordering for pipeline
  const roleOrder = ['ceo', 'pm', 'researcher', 'product', 'designer', 'frontend', 'backend', 'tester', 'marketing', 'analyst', 'writer']
  const sorted = [...agents].sort((a, b) => {
    const ai = roleOrder.indexOf(a.role)
    const bi = roleOrder.indexOf(b.role)
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  })

  if (template === 'pipeline') {
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i]
      const b = sorted[i + 1]
      result[a.id].add(b.id)
      result[b.id].add(a.id) // Bidirectional
    }
    return result
  }

  if (template === 'star') {
    // Find PM or first agent as hub
    const hub = sorted.find(a => a.role === 'pm') || sorted[0]
    if (hub) {
      for (const a of agents) {
        if (a.id !== hub.id) {
          result[hub.id].add(a.id)
          result[a.id].add(hub.id)
        }
      }
    }
    return result
  }

  return result
}

/**
 * CommMatrix — NxN permission grid for agent communication.
 *
 * Rows = sender, Columns = receiver.
 * Click a cell to toggle permission.
 * Preset buttons for common patterns.
 */
export function CommMatrix({ agents, permissions, onToggle, onApplyTemplate, saving }: CommMatrixProps) {
  const { t } = useTranslation()

  const templates: { key: CommTemplate; label: string; labelEn: string; desc: string }[] = [
    { key: 'pipeline', label: '流水线', labelEn: 'Pipeline', desc: 'PM→研究→产品→设计→前端→后端→测试' },
    { key: 'star', label: '星形', labelEn: 'Star', desc: 'PM 为中心，辐射到所有角色' },
    { key: 'full', label: '全通', labelEn: 'Full Mesh', desc: '所有 Agent 互相通讯' },
    { key: 'none', label: '断开', labelEn: 'None', desc: '清除所有通讯权限' },
  ]

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              {t('messages.commPermissions')}
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
            </CardTitle>
            <CardDescription className="text-xs">{t('messages.commPermissionsDesc')}</CardDescription>
          </div>
          {/* Template buttons */}
          <div className="flex gap-1.5 flex-wrap">
            <Wand2 className="w-3.5 h-3.5 text-muted-foreground mt-1.5" />
            {templates.map(tmpl => (
              <button
                key={tmpl.key}
                onClick={() => onApplyTemplate(tmpl.key)}
                title={tmpl.desc}
                className="px-2 py-1 text-[10px] border border-border rounded-md hover:border-primary/30 hover:bg-primary/5 transition-colors"
              >
                {tmpl.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {agents.length < 2 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t('messages.needMoreAgents')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr>
                  <th className="p-1.5 text-left text-muted-foreground font-medium min-w-[60px]">
                    ↗
                  </th>
                  {agents.map(to => (
                    <th key={to.id} className="p-1.5 text-center min-w-[44px]">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-sm">{ROLE_EMOJI[to.role] || '🤖'}</span>
                        <span className="text-[9px] text-muted-foreground truncate max-w-[50px]">{to.role}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agents.map(from => (
                  <tr key={from.id} className="hover:bg-muted/20">
                    <td className="p-1.5">
                      <div className="flex items-center gap-1">
                        <span className="text-sm">{ROLE_EMOJI[from.role] || '🤖'}</span>
                        <span className="text-[10px] text-muted-foreground truncate max-w-[50px]">{from.role}</span>
                      </div>
                    </td>
                    {agents.map(to => {
                      const isSelf = from.id === to.id
                      const allowed = permissions[from.id]?.has(to.id) || false

                      if (isSelf) {
                        return (
                          <td key={to.id} className="p-1.5 text-center">
                            <div className="w-8 h-8 rounded bg-muted/30 flex items-center justify-center mx-auto">
                              <span className="text-[10px] text-muted-foreground">—</span>
                            </div>
                          </td>
                        )
                      }

                      return (
                        <td key={to.id} className="p-1.5 text-center">
                          <button
                            onClick={() => onToggle(from.id, to.id, !allowed)}
                            className={`w-8 h-8 rounded flex items-center justify-center mx-auto transition-colors ${
                              allowed
                                ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                                : 'bg-muted/30 text-muted-foreground/30 hover:bg-muted/50 hover:text-muted-foreground'
                            }`}
                          >
                            {allowed
                              ? <Check className="w-3.5 h-3.5" />
                              : <X className="w-3 h-3" />
                            }
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
