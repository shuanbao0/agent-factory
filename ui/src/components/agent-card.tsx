'use client'
import React, { useState, useEffect } from 'react'
import { Agent } from '@/lib/types'
import { useTranslation } from '@/lib/i18n'
import { useAppStore } from '@/lib/store'
import { Card, CardContent } from './ui/card'
import { Badge } from './ui/badge'
import { timeAgo, formatNumber } from '@/lib/utils'
import { Zap, MessageSquare, CheckCircle, ListTodo, Pencil, Trash2, ChevronRight, Loader2, RefreshCw } from 'lucide-react'
import Link from 'next/link'

const statusColor = { online: 'success', busy: 'warning' } as const
const roleIcon: Record<string, string> = {
  ceo: '👔', pm: '📋', product: '📦', designer: '🎨',
  frontend: '💻', backend: '⚙️', tester: '🧪', researcher: '🔬',
  marketing: '📣', analyst: '📊', writer: '✍️', main: '🏠',
  'novel-chief': '📚', worldbuilder: '🌍', 'character-designer': '👤',
  'plot-architect': '🗺️', 'pacing-designer': '⚡', 'continuity-mgr': '🔗',
  'novel-writer': '✒️', 'style-editor': '💎', 'reader-analyst': '📈',
  'novel-researcher': '🔍',
}

interface AgentCardProps {
  agent: Agent
  onEdit?: () => void
  onDelete?: () => void
}

export const AgentCard = React.memo(function AgentCard({ agent, onEdit, onDelete }: AgentCardProps) {
  const { t } = useTranslation()
  const templates = useAppStore(s => s.templates)
  const [mounted, setMounted] = useState(false)
  const [syncing, setSyncing] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Find template for badge
  const template = agent.templateId ? templates.find(t => t.id === agent.templateId) : null

  const handleSyncConfig = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setSyncing(true)
    try {
      await fetch('/api/agents/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: agent.id, action: 'sync-config' }),
      })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <Card className="hover:border-primary/30 transition-colors group">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center text-lg shrink-0">
            {template?.emoji || roleIcon[agent.role] || '🤖'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Link href={`/agents/${agent.id}`} className="font-semibold text-sm truncate hover:text-primary transition-colors">
                {agent.name}
              </Link>
              <Badge variant={statusColor[agent.status]}>{agent.status}</Badge>

              {/* Actions — visible on hover */}
              <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {/* Sync Config */}
                <button
                  onClick={handleSyncConfig}
                  disabled={syncing}
                  className="p-1 text-muted-foreground hover:text-blue-400 transition-colors"
                  title="Sync config (AGENTS.md → workspace)"
                >
                  {syncing
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <RefreshCw className="w-3.5 h-3.5" />
                  }
                </button>
                {onEdit && (
                  <button onClick={onEdit} className="p-1 text-muted-foreground hover:text-primary" title={t('common.edit')}>
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
                {onDelete && (
                  <button onClick={onDelete} className="p-1 text-muted-foreground hover:text-destructive" title={t('common.delete')}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <Link href={`/agents/${agent.id}`} className="p-1 text-muted-foreground hover:text-primary">
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1 truncate">{agent.description}</p>
            {agent.currentTask && (
              <p className="text-xs text-primary mt-2 truncate">▸ {agent.currentTask}{agent.currentProject && ` · ${agent.currentProject}`}</p>
            )}
            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Zap className="w-3 h-3" />{formatNumber(agent.tokensUsed)} {t('common.tokens')}</span>
              {(agent.tasksCompleted > 0 || agent.tasksInProgress > 0) ? (
                <>
                  {agent.tasksInProgress > 0 && (
                    <span className="flex items-center gap-1 text-yellow-400"><ListTodo className="w-3 h-3" />{agent.tasksInProgress} {t('common.inProgress')}</span>
                  )}
                  <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3" />{agent.tasksCompleted} {t('common.completed')}</span>
                </>
              ) : (
                <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{formatNumber(agent.messagesCount)} {t('common.messages')}</span>
              )}
              {template && (
                <Badge variant="muted" className="text-[9px] py-0 px-1.5">
                  {template.emoji} {template.id}
                </Badge>
              )}
              <span className="ml-auto">{mounted ? timeAgo(agent.lastActive) : ''}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
})
