'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useTranslation } from '@/lib/i18n'
import { useAppStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AgentGraph } from '@/components/agent-graph'
import { CommMatrix, generateTemplate, type CommTemplate } from '@/components/comm-matrix'
import { ChannelTimeline } from '@/components/channel-timeline'
import { MessageSquare, RefreshCw, FolderOpen, MessagesSquare, ArrowRight } from 'lucide-react'
import { timeAgo } from '@/lib/utils'
import type { TimelineMessage, Channel } from '@/lib/types'

// ── Types ────────────────────────────────────────────────────────
interface AgentMessage {
  id: string
  timestamp: string
  fromAgent: string
  toAgent: string
  type: 'spawn' | 'send' | 'complete' | 'error' | 'log'
  content: string
  sessionKey?: string
}

interface FsProject {
  id: string
  name: string
  assignedAgents?: string[]
  createdAt?: string
}

const ROLE_EMOJI: Record<string, string> = {
  ceo: '👔', pm: '📋', product: '📦', designer: '🎨',
  frontend: '💻', backend: '⚙️', tester: '🧪', researcher: '🔬',
  marketing: '📣', analyst: '📊', writer: '✍️',
}

// ── Main Page ────────────────────────────────────────────────────
export default function MessagesPage() {
  const { t } = useTranslation()
  const agents = useAppStore(s => s.agents)

  // Messages state
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [loading, setLoading] = useState(true)

  // Projects state (for channel building)
  const [projects, setProjects] = useState<FsProject[]>([])

  // Channel state
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null)
  const [channelMessages, setChannelMessages] = useState<TimelineMessage[]>([])
  const [loadingChannel, setLoadingChannel] = useState(false)

  // Collapsible sections
  const [graphCollapsed, setGraphCollapsed] = useState(true)
  const [matrixCollapsed, setMatrixCollapsed] = useState(true)

  // Permissions state
  const [permissions, setPermissions] = useState<Record<string, Set<string>>>({})
  const [savingPerms, setSavingPerms] = useState(false)

  // ── Fetch messages ─────────────────────────────────────────────
  const fetchMessages = useCallback(async (isAutoRefresh = false) => {
    if (!isAutoRefresh) setLoading(true)
    try {
      const res = await fetch('/api/messages')
      if (res.ok) {
        const data = await res.json()
        const newMsgs: AgentMessage[] = data.messages || []
        // Don't replace with fewer results on auto-refresh (prevents flickering)
        if (isAutoRefresh && newMsgs.length === 0) return
        setMessages(newMsgs)
      }
    } catch {} finally { if (!isAutoRefresh) setLoading(false) }
  }, [])

  // ── Fetch projects ─────────────────────────────────────────────
  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects')
      if (res.ok) {
        const data = await res.json()
        setProjects(data.projects || [])
      }
    } catch {}
  }, [])

  // ── Fetch permissions ──────────────────────────────────────────
  const fetchPermissions = useCallback(async () => {
    try {
      const res = await fetch('/api/agents/permissions')
      if (res.ok) {
        const data = await res.json()
        const perms: Record<string, Set<string>> = {}
        for (const [id, peers] of Object.entries(data.permissions || {})) {
          perms[id] = new Set(peers as string[])
        }
        for (const a of agents) {
          if (!perms[a.id]) perms[a.id] = new Set()
        }
        setPermissions(perms)
      }
    } catch {}
  }, [agents])

  useEffect(() => { fetchMessages(); fetchProjects() }, [fetchMessages, fetchProjects])
  useEffect(() => { fetchPermissions() }, [fetchPermissions])

  // Auto-refresh messages every 10s (silent, no loading flash)
  useEffect(() => {
    const timer = setInterval(() => fetchMessages(true), 10000)
    return () => clearInterval(timer)
  }, [fetchMessages])

  // ── Save permissions ───────────────────────────────────────────
  const savePermissions = useCallback(async (newPerms: Record<string, Set<string>>) => {
    setSavingPerms(true)
    try {
      const serialized: Record<string, string[]> = {}
      for (const [id, peers] of Object.entries(newPerms)) {
        serialized[id] = Array.from(peers)
      }
      await fetch('/api/agents/permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: serialized }),
      })
    } catch {} finally { setSavingPerms(false) }
  }, [])

  // ── Handle permission toggle ───────────────────────────────────
  const handleToggle = (from: string, to: string, allowed: boolean) => {
    const newPerms = { ...permissions }
    for (const k of Object.keys(newPerms)) {
      newPerms[k] = new Set(newPerms[k])
    }
    if (!newPerms[from]) newPerms[from] = new Set()
    if (allowed) {
      newPerms[from].add(to)
    } else {
      newPerms[from].delete(to)
    }
    setPermissions(newPerms)
    savePermissions(newPerms)
  }

  // ── Apply template ─────────────────────────────────────────────
  const handleApplyTemplate = (template: CommTemplate) => {
    const newPerms = generateTemplate(agents, template)
    setPermissions(newPerms)
    savePermissions(newPerms)
  }

  // ── Compute graph edges from messages ──────────────────────────
  const graphEdges = useMemo(() => {
    const edgeMap = new Map<string, { from: string; to: string; count: number; lastMessage?: string }>()
    for (const m of messages) {
      const key = [m.fromAgent, m.toAgent].sort().join('↔')
      const existing = edgeMap.get(key)
      if (existing) {
        existing.count++
        existing.lastMessage = m.content
      } else {
        edgeMap.set(key, {
          from: m.fromAgent,
          to: m.toAgent,
          count: 1,
          lastMessage: m.content,
        })
      }
    }
    return Array.from(edgeMap.values())
  }, [messages])

  // ── Build channels from messages + projects ────────────────────
  const channels = useMemo(() => {
    const result: Channel[] = []
    const coveredAgentPairs = new Set<string>()

    // 1. Project channels
    for (const project of projects) {
      if (!project.assignedAgents?.length) continue
      const agentSet = new Set(project.assignedAgents)
      const projectMsgs = messages.filter(m =>
        agentSet.has(m.fromAgent) && agentSet.has(m.toAgent)
      )
      if (projectMsgs.length === 0 && messages.length > 0) continue // skip empty project channels if there are messages
      result.push({
        id: `project:${project.id}`,
        type: 'project',
        label: project.name,
        agents: project.assignedAgents,
        messageCount: projectMsgs.length,
        lastTimestamp: projectMsgs[0]?.timestamp || project.createdAt || '',
        projectId: project.id,
      })
      // Track pairs covered by projects
      for (const a of project.assignedAgents) {
        for (const b of project.assignedAgents) {
          if (a !== b) coveredAgentPairs.add([a, b].sort().join(':'))
        }
      }
    }

    // 2. Direct pair channels from messages
    const pairMap = new Map<string, { agents: [string, string]; msgs: AgentMessage[] }>()
    for (const m of messages) {
      if (m.fromAgent === 'user' || m.fromAgent === 'gateway' || m.fromAgent === 'system') continue
      if (m.toAgent === 'user' || m.toAgent === 'gateway' || m.toAgent === 'system') continue
      const pairKey = [m.fromAgent, m.toAgent].sort().join(':')
      if (!pairMap.has(pairKey)) {
        pairMap.set(pairKey, {
          agents: [m.fromAgent, m.toAgent].sort() as [string, string],
          msgs: [],
        })
      }
      pairMap.get(pairKey)!.msgs.push(m)
    }

    pairMap.forEach(({ agents: pairAgents, msgs }, pairKey) => {
      if (coveredAgentPairs.has(pairKey)) return
      const getEmoji = (id: string) => {
        const agent = agents.find(a => a.id === id)
        return ROLE_EMOJI[agent?.role || ''] || ROLE_EMOJI[id] || '🤖'
      }
      const getName = (id: string) => {
        const agent = agents.find(a => a.id === id)
        return agent?.name || id
      }
      result.push({
        id: `pair:${pairKey}`,
        type: 'pair',
        label: `${getEmoji(pairAgents[0])}${getName(pairAgents[0])} ↔ ${getEmoji(pairAgents[1])}${getName(pairAgents[1])}`,
        agents: pairAgents,
        messageCount: msgs.length,
        lastTimestamp: msgs[0]?.timestamp || '',
      })
    })

    return result.sort((a, b) =>
      new Date(b.lastTimestamp || 0).getTime() - new Date(a.lastTimestamp || 0).getTime()
    )
  }, [messages, projects, agents])

  // ── Fetch channel messages (full content) ──────────────────────
  const fetchChannelMessages = useCallback(async (channel: Channel, silent = false) => {
    if (!silent) setLoadingChannel(true)
    try {
      const params = new URLSearchParams({ full: '1' })
      if (channel.type === 'project' && channel.projectId) {
        params.set('projectId', channel.projectId)
      } else {
        params.set('agents', channel.agents.join(','))
      }
      const res = await fetch(`/api/messages?${params}`)
      if (res.ok) {
        const data = await res.json()
        const newMsgs = data.messages || []
        if (silent && newMsgs.length === 0) return // don't clear on silent refresh
        setChannelMessages(newMsgs)
      }
    } catch {} finally { if (!silent) setLoadingChannel(false) }
  }, [])

  // When channel selection changes, fetch full messages
  useEffect(() => {
    if (selectedChannel) {
      fetchChannelMessages(selectedChannel)
    } else {
      setChannelMessages([])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChannel, fetchChannelMessages])

  // Auto-refresh channel timeline when main messages list updates (silent)
  useEffect(() => {
    if (selectedChannel && messages.length > 0) {
      fetchChannelMessages(selectedChannel, true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages])

  const handleChannelSelect = (channel: Channel) => {
    setSelectedChannel(prev => prev?.id === channel.id ? prev : channel)
  }

  const handleRefreshChannel = () => {
    if (selectedChannel) {
      fetchChannelMessages(selectedChannel)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="w-6 h-6" /> {t('messages.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t('messages.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setGraphCollapsed(!graphCollapsed)}
            className="px-3 py-1.5 text-xs rounded border border-border bg-muted hover:bg-muted/80 text-foreground"
          >
            {graphCollapsed ? t('messages.showGraph') : t('messages.hideGraph')}
          </button>
          <button
            onClick={() => setMatrixCollapsed(!matrixCollapsed)}
            className="px-3 py-1.5 text-xs rounded border border-border bg-muted hover:bg-muted/80 text-foreground"
          >
            {matrixCollapsed ? t('messages.showMatrix') : t('messages.hideMatrix')}
          </button>
          <button
            onClick={() => { fetchMessages(); if (selectedChannel) fetchChannelMessages(selectedChannel) }}
            disabled={loading}
            className="p-2 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Badge variant="muted">{messages.length} {t('messages.total')}</Badge>
        </div>
      </div>

      {/* Collapsible Agent Graph */}
      {!graphCollapsed && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t('messages.networkGraph')}</CardTitle>
          </CardHeader>
          <CardContent>
            <AgentGraph
              agents={agents.map(a => ({ id: a.id, role: a.role, name: a.name }))}
              edges={graphEdges}
              peers={Object.fromEntries(
                Object.entries(permissions).map(([id, set]) => [id, Array.from(set)])
              )}
              selectedEdge={null}
              onEdgeClick={() => {}}
              onNodeClick={() => {}}
            />
          </CardContent>
        </Card>
      )}

      {/* Main content: Channel list + Timeline */}
      <div
        className="grid grid-cols-1 lg:grid-cols-4 gap-4"
        style={{ height: 'calc(100vh - 220px)' }}
      >
        {/* Left: Channel list */}
        <Card className="lg:col-span-1 overflow-y-auto">
          <CardContent className="p-3">
            {channels.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MessagesSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">{t('messages.noChannels')}</p>
                <p className="text-xs mt-1">{t('messages.noChannelsHint')}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Project channels */}
                {channels.some(c => c.type === 'project') && (
                  <div>
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <FolderOpen className="w-3.5 h-3.5" />
                      {t('messages.projectChannels')}
                    </h3>
                    <div className="space-y-1">
                      {channels.filter(c => c.type === 'project').map(ch => (
                        <ChannelItem
                          key={ch.id}
                          channel={ch}
                          selected={selectedChannel?.id === ch.id}
                          onSelect={handleChannelSelect}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Direct pair channels */}
                {channels.some(c => c.type === 'pair') && (
                  <div>
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5" />
                      {t('messages.directChats')}
                    </h3>
                    <div className="space-y-1">
                      {channels.filter(c => c.type === 'pair').map(ch => (
                        <ChannelItem
                          key={ch.id}
                          channel={ch}
                          selected={selectedChannel?.id === ch.id}
                          onSelect={handleChannelSelect}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Timeline */}
        <Card className="lg:col-span-3 flex flex-col overflow-hidden">
          {selectedChannel ? (
            <ChannelTimeline
              channel={selectedChannel}
              messages={channelMessages as TimelineMessage[]}
              loading={loadingChannel}
              agents={agents}
              onRefresh={handleRefreshChannel}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <ArrowRight className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">{t('messages.selectChannel')}</p>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Collapsible Permissions Matrix */}
      {!matrixCollapsed && (
        <CommMatrix
          agents={agents.map(a => ({ id: a.id, role: a.role, name: a.name }))}
          permissions={permissions}
          onToggle={handleToggle}
          onApplyTemplate={handleApplyTemplate}
          saving={savingPerms}
        />
      )}
    </div>
  )
}

// ── Channel list item ──────────────────────────────────────────
function ChannelItem({
  channel,
  selected,
  onSelect,
}: {
  channel: Channel
  selected: boolean
  onSelect: (ch: Channel) => void
}) {
  return (
    <button
      onClick={() => onSelect(channel)}
      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
        selected
          ? 'bg-primary/10 text-primary border border-primary/20'
          : 'hover:bg-muted/80 text-foreground'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="truncate font-medium text-xs">
          {channel.type === 'project' ? `# ${channel.label}` : channel.label}
        </span>
        {channel.messageCount > 0 && (
          <Badge variant="muted" className="text-[10px] ml-1 shrink-0">
            {channel.messageCount}
          </Badge>
        )}
      </div>
      {channel.lastTimestamp && (
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {timeAgo(channel.lastTimestamp)}
        </p>
      )}
    </button>
  )
}
