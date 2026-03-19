'use client'
import { useState, useRef, useCallback } from 'react'
import { useTranslation } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'
import { ArrowRight, Send, Loader2, ChevronDown } from 'lucide-react'
import { timeAgo } from '@/lib/utils'
import type { TimelineMessage, Channel, Agent } from '@/lib/types'

const ROLE_EMOJI: Record<string, string> = {
  ceo: '👔', pm: '📋', product: '📦', designer: '🎨',
  frontend: '💻', backend: '⚙️', tester: '🧪', researcher: '🔬',
  marketing: '📣', analyst: '📊', writer: '✍️',
}

const typeColors: Record<string, string> = {
  spawn: 'border-l-blue-500',
  send: 'border-l-emerald-500',
  complete: 'border-l-green-500',
  error: 'border-l-red-500',
  log: 'border-l-gray-500',
}

const typeBadgeColors: Record<string, string> = {
  spawn: 'bg-blue-400/10 text-blue-400 border-blue-400/20',
  send: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
  complete: 'bg-green-400/10 text-green-400 border-green-400/20',
  error: 'bg-red-400/10 text-red-400 border-red-400/20',
  log: 'bg-gray-400/10 text-gray-400 border-gray-400/20',
}

const TYPE_LABEL_KEYS: Record<string, string> = {
  spawn: 'messages.typeSpawn',
  send: 'messages.typeSend',
  complete: 'messages.typeComplete',
  error: 'messages.typeError',
  log: 'messages.typeLog',
}

const COLLAPSE_THRESHOLD = 300

interface ChannelTimelineProps {
  channel: Channel
  messages: TimelineMessage[]
  loading: boolean
  agents: Agent[]
  onRefresh: () => void
}

export function ChannelTimeline({ channel, messages, loading, agents, onRefresh }: ChannelTimelineProps) {
  const { t } = useTranslation()
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [targetAgent, setTargetAgent] = useState<string>(channel.agents[0] || '')
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [streamText, setStreamText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const getEmoji = useCallback((agentId: string) => {
    const agent = agents.find(a => a.id === agentId)
    if (agent) {
      const roleEmoji = ROLE_EMOJI[agent.role] || ROLE_EMOJI[agent.id]
      if (roleEmoji) return roleEmoji
    }
    return ROLE_EMOJI[agentId] || '🤖'
  }, [agents])

  const getAgentName = useCallback((agentId: string) => {
    const agent = agents.find(a => a.id === agentId)
    return agent?.name || agentId
  }, [agents])

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Messages sorted ascending for natural reading (oldest first)
  const sorted = [...messages].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )

  const handleSend = async () => {
    if (!input.trim() || sending || !targetAgent) return
    const message = input.trim()
    setInput('')
    setSending(true)
    setStreamText('')

    try {
      const res = await fetch(`/api/agents/${targetAgent}/chat?stream=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        setStreamText(`Error: ${err.error || 'Unknown error'}`)
        return
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let finalText = ''

      if (reader) {
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split('\n\n')
          buffer = parts.pop() || ''

          for (const part of parts) {
            if (!part.trim()) continue
            const lines = part.split('\n')
            let event = ''
            let data = ''
            for (const line of lines) {
              if (line.startsWith('event: ')) event = line.slice(7)
              if (line.startsWith('data: ')) data = line.slice(6)
            }
            if (!data) continue

            try {
              const parsed = JSON.parse(data)
              switch (event) {
                case 'delta':
                  setStreamText(parsed.text || '')
                  finalText = parsed.text || finalText
                  break
                case 'final':
                  finalText = parsed.text || finalText
                  setStreamText('')
                  break
                case 'error':
                  setStreamText(`Error: ${parsed.error || 'Unknown error'}`)
                  finalText = ''
                  break
                case 'aborted':
                  setStreamText('')
                  break
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setStreamText(`Error: ${msg}`)
    } finally {
      setSending(false)
      setStreamText('')
      // Refresh channel messages after sending
      onRefresh()
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border shrink-0">
        <h3 className="font-medium text-sm">
          {channel.type === 'project' ? `📁 ${channel.label}` : channel.label}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {channel.agents.map(a => `${getEmoji(a)} ${getAgentName(a)}`).join(' · ')}
        </p>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {t('messages.noMessages')}
          </div>
        ) : (
          sorted.map(m => {
            const expanded = expandedIds.has(m.id)
            const needsCollapse = m.content.length > COLLAPSE_THRESHOLD
            const displayContent = needsCollapse && !expanded
              ? m.content.slice(0, COLLAPSE_THRESHOLD)
              : m.content

            return (
              <div
                key={m.id}
                className={`flex gap-3 p-3 rounded-lg border-l-2 bg-card ${typeColors[m.type] || typeColors.log}`}
              >
                <div className="shrink-0 text-lg">{getEmoji(m.fromAgent)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs mb-1 flex-wrap">
                    <span className="font-medium">{getAgentName(m.fromAgent)}</span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                    <span className="font-medium">{getAgentName(m.toAgent)}</span>
                    <Badge variant="muted" className={`text-[10px] ${typeBadgeColors[m.type] || ''}`}>
                      {TYPE_LABEL_KEYS[m.type] ? t(TYPE_LABEL_KEYS[m.type]) : m.type}
                    </Badge>
                    <span className="text-muted-foreground ml-auto">{timeAgo(m.timestamp)}</span>
                  </div>
                  <div className="text-sm break-words whitespace-pre-wrap text-foreground/90">
                    {displayContent}
                    {needsCollapse && (
                      <button
                        onClick={() => toggleExpand(m.id)}
                        className="text-primary text-xs ml-1 hover:underline"
                      >
                        {expanded ? t('messages.showLess') : t('messages.showMore')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}

        {/* Streaming response indicator */}
        {streamText && (
          <div className="flex gap-3 p-3 rounded-lg border-l-2 border-l-purple-500 bg-card">
            <div className="shrink-0 text-lg">{getEmoji(targetAgent)}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs mb-1">
                <span className="font-medium">{getAgentName(targetAgent)}</span>
                <Badge variant="muted" className="text-[10px]">{t('messages.agentReplying')}</Badge>
              </div>
              <div className="text-sm break-words whitespace-pre-wrap text-foreground/90">
                {streamText}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="px-4 py-3 border-t border-border shrink-0 flex items-center gap-2">
        <span className="text-xs text-muted-foreground whitespace-nowrap">{t('messages.sendToAgent')}</span>
        <div className="relative">
          <select
            value={targetAgent}
            onChange={e => setTargetAgent(e.target.value)}
            className="bg-muted border border-border rounded px-2 py-1.5 text-xs text-foreground appearance-none pr-6 min-w-[120px]"
          >
            <option value="">{t('messages.selectAgent')}</option>
            {channel.agents.map(id => (
              <option key={id} value={id}>{getEmoji(id)} {getAgentName(id)}</option>
            ))}
          </select>
          <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder={t('messages.inputPlaceholder')}
          disabled={sending || !targetAgent}
          className="flex-1 bg-muted border border-border rounded px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={sending || !input.trim() || !targetAgent}
          className="p-2 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  )
}
