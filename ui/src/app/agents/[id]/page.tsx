'use client'
import { useEffect, useState, useCallback, useRef, useMemo, memo } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useTranslation } from '@/lib/i18n'
import { useAppStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useMobile } from '@/hooks/use-mobile'
import {
  ArrowLeft, User, Cpu, Activity, FolderTree, MessageSquare,
  FileText, ChevronRight, Loader2, Puzzle, Check, X, RefreshCw, Sparkles,
  Pencil, Save
} from 'lucide-react'
import Link from 'next/link'
import { formatNumber, timeAgo } from '@/lib/utils'
import { IdentityDiffReview } from '@/components/identity-diff-review'

// ── Types ────────────────────────────────────────────────────────
interface AgentDetail {
  id: string
  role: string
  name: string
  description: string
  status: string
  model?: string
}

interface FileEntry {
  name: string
  type: 'file' | 'directory'
  size?: number
  path: string
}

interface SessionEntry {
  key: string
  agentId: string
  kind: string
  lastMessage?: string
  lastAt?: string
  messageCount?: number
}

interface SessionMessage {
  role: string
  content: string
  timestamp?: string
}

interface SkillEntry {
  slug: string
  enabled: boolean
  hasSkillMd: boolean
  source: 'builtin' | 'project'
  description: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

// ── Stable Chat Component (outside page to avoid re-render) ──────
// 通过 OpenClaw Gateway WebSocket 协议与 Agent 对话
// Agent 拥有完整工具链，支持多 Agent 协作
const AgentChat = memo(function AgentChat({ agentId, t }: { agentId: string; t: (k: string) => string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [streamText, setStreamText] = useState('') // SSE streaming 中的实时文本
  const inputRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamText])

  const send = async () => {
    if (!input.trim() || sending) return
    const userMsg: ChatMessage = { role: 'user', content: input.trim(), timestamp: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setSending(true)
    setStreamText('')

    try {
      // 使用 SSE streaming 模式，通过 Gateway WebSocket 与 Agent 对话
      const res = await fetch(`/api/agents/${agentId}/chat?stream=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg.content }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Error: ${err.error || err.reply || 'Unknown error'}`,
          timestamp: new Date().toISOString(),
        }])
        return
      }

      // 解析 SSE stream
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let finalText = ''

      if (reader) {
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          // 按 SSE 格式解析：event: xxx\ndata: {...}\n\n
          const parts = buffer.split('\n\n')
          buffer = parts.pop() || '' // 保留未完成的部分

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
                  setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: finalText || '(no response)',
                    timestamp: new Date().toISOString(),
                  }])
                  break
                case 'error':
                  setStreamText('')
                  setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `Error: ${parsed.error || 'Unknown error'}`,
                    timestamp: new Date().toISOString(),
                  }])
                  break
                case 'aborted':
                  setStreamText('')
                  setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: finalText || '(aborted)',
                    timestamp: new Date().toISOString(),
                  }])
                  break
              }
            } catch {}
          }
        }

        // 如果 stream 结束但没有 final event（异常情况）
        if (finalText && !messages.find(m => m.content === finalText)) {
          setStreamText('')
          setMessages(prev => {
            const last = prev[prev.length - 1]
            if (last?.role === 'assistant' && last.content === finalText) return prev
            return [...prev, {
              role: 'assistant',
              content: finalText,
              timestamp: new Date().toISOString(),
            }]
          })
        }
      }
    } catch (e: any) {
      setStreamText('')
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${e.message}`,
        timestamp: new Date().toISOString(),
      }])
    } finally {
      setSending(false)
      setStreamText('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  return (
    <Card className="flex flex-col" style={{ height: 'calc(100vh - 200px)', minHeight: '400px' }}>
      <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <MessageSquare className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">{t('agents.chatEmpty')}</p>
            <p className="text-xs mt-1">{t('agents.chatEmptyHint')}</p>
            <div className="flex items-center gap-1.5 mt-3 px-2 py-1 rounded bg-muted/50 text-[10px]">
              <Activity className="w-3 h-3" />
              <span>via OpenClaw Gateway · {t('agents.chatFullToolchain')}</span>
            </div>
          </div>
        ) : (
          <>
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                  m.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/50 border border-border'
                }`}>
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  <p className={`text-[10px] mt-1 ${
                    m.role === 'user' ? 'text-primary-foreground/60' : 'text-muted-foreground'
                  }`}>
                    {new Date(m.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </>
        )}
        {sending && (
          <div className="flex justify-start">
            <div className="max-w-[80%] px-3 py-2 rounded-lg bg-muted/50 border border-border text-sm">
              {streamText ? (
                <p className="whitespace-pre-wrap break-words">{streamText}<span className="animate-pulse">▊</span></p>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span className="text-xs">{t('agents.chatThinking')}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>

      <div className="border-t border-border p-3 flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder={t('agents.chatPlaceholder')}
          disabled={sending}
          className="flex-1 px-3 py-2 text-sm bg-muted/30 border border-border rounded-lg focus:outline-none focus:border-primary disabled:opacity-50"
        />
        <button
          onClick={send}
          disabled={!input.trim() || sending}
          className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {t('agents.chatSend')}
        </button>
      </div>
    </Card>
  )
})

// ── Tab type ─────────────────────────────────────────────────────
type Tab = 'info' | 'chat' | 'sessions' | 'files' | 'skills'

export default function AgentWorkspacePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t } = useTranslation()
  const agents = useAppStore(s => s.agents)
  const agentModels = useAppStore(s => s.agentModels)
  const defaultModel = useAppStore(s => s.defaultModel)
  const isMobile = useMobile()

  const [tab, setTab] = useState<Tab>('info')
  const [files, setFiles] = useState<FileEntry[]>([])
  const [sessions, setSessions] = useState<SessionEntry[]>([])
  const [selectedSession, setSelectedSession] = useState<string | null>(null)
  const [messages, setMessages] = useState<SessionMessage[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [fileContent, setFileContent] = useState<{ name: string; content: string } | null>(null)
  const [skills, setSkills] = useState<SkillEntry[]>([])
  const [loadingSkills, setLoadingSkills] = useState(false)
  const [savingSkills, setSavingSkills] = useState(false)
  const [syncingConfig, setSyncingConfig] = useState(false)
  const [initializingAI, setInitializingAI] = useState(false)
  const [initLog, setInitLog] = useState('')
  const [agentConfig, setAgentConfig] = useState<{ peers?: string[]; skills?: string[] } | null>(null)
  const [skillFilter, setSkillFilter] = useState<'all' | 'enabled' | 'builtin' | 'project'>('all')

  // Identity & Soul state
  const [identityContent, setIdentityContent] = useState('')
  const [soulContent, setSoulContent] = useState('')
  const [editingIdentity, setEditingIdentity] = useState(false)
  const [editingSoul, setEditingSoul] = useState(false)
  const [editIdentityDraft, setEditIdentityDraft] = useState('')
  const [editSoulDraft, setEditSoulDraft] = useState('')
  const [savingIdentity, setSavingIdentity] = useState(false)
  const [savingSoul, setSavingSoul] = useState(false)

  // Auto-init state
  const [waitingForGateway, setWaitingForGateway] = useState(false)
  const autoInitTriggered = useRef(false)

  // Diff review state
  const [showDiffReview, setShowDiffReview] = useState(false)
  const [diffData, setDiffData] = useState<{
    oldIdentity: string; newIdentity: string;
    oldSoul: string; newSoul: string;
  } | null>(null)

  const agent = agents.find(a => a.id === id)
  const model = agentModels[id] || defaultModel

  // ── Fetch identity files ─────────────────────────────────────────
  const fetchIdentityFiles = useCallback(async () => {
    try {
      const [idRes, soulRes] = await Promise.all([
        fetch(`/api/agents/${id}/workspace?file=IDENTITY.md`),
        fetch(`/api/agents/${id}/workspace?file=SOUL.md`),
      ])
      if (idRes.ok) {
        const data = await idRes.json()
        setIdentityContent(data.content || '')
      }
      if (soulRes.ok) {
        const data = await soulRes.json()
        setSoulContent(data.content || '')
      }
    } catch {}
  }, [id])

  // ── Save identity file ──────────────────────────────────────────
  const saveIdentityFile = async (file: string, content: string) => {
    const setSaving = file === 'IDENTITY.md' ? setSavingIdentity : setSavingSoul
    setSaving(true)
    try {
      await fetch(`/api/agents/${id}/workspace`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file, content }),
      })
      if (file === 'IDENTITY.md') {
        setIdentityContent(content)
        setEditingIdentity(false)
      } else {
        setSoulContent(content)
        setEditingSoul(false)
      }
    } catch {} finally { setSaving(false) }
  }

  // ── Fetch files ────────────────────────────────────────────────
  const fetchFiles = useCallback(async () => {
    setLoadingFiles(true)
    try {
      const res = await fetch(`/api/agents/${id}/workspace`)
      if (res.ok) {
        const data = await res.json()
        setFiles(data.files || [])
      }
    } catch {} finally { setLoadingFiles(false) }
  }, [id])

  // ── Fetch sessions ─────────────────────────────────────────────
  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true)
    try {
      const res = await fetch(`/api/agents/${id}/sessions`)
      if (res.ok) {
        const data = await res.json()
        setSessions(data.sessions || [])
      }
    } catch {} finally { setLoadingSessions(false) }
  }, [id])

  // ── Fetch session messages ─────────────────────────────────────
  const fetchMessages = useCallback(async (sessionKey: string) => {
    setLoadingMessages(true)
    setSelectedSession(sessionKey)
    try {
      const res = await fetch(`/api/agents/${id}/sessions?sessionKey=${encodeURIComponent(sessionKey)}`)
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages || [])
      }
    } catch {} finally { setLoadingMessages(false) }
  }, [id])

  // ── Fetch file content ─────────────────────────────────────────
  const fetchFileContent = async (path: string, name: string) => {
    try {
      const res = await fetch(`/api/agents/${id}/workspace?file=${encodeURIComponent(path)}`)
      if (res.ok) {
        const data = await res.json()
        setFileContent({ name, content: data.content || '' })
      }
    } catch {}
  }

  // ── Fetch skills ────────────────────────────────────────────────
  const fetchSkills = useCallback(async () => {
    setLoadingSkills(true)
    try {
      const res = await fetch(`/api/agents/${id}/skills`)
      if (res.ok) {
        const data = await res.json()
        setSkills(data.skills || [])
      }
    } catch {} finally { setLoadingSkills(false) }
  }, [id])

  // ── Sync AGENTS.md + TOOLS.md → workspace ──────────────────────
  const handleSyncConfig = async () => {
    setSyncingConfig(true)
    try {
      await fetch('/api/agents/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: id, action: 'sync-config' }),
      })
    } catch {} finally { setSyncingConfig(false) }
  }

  // ── AI-generate IDENTITY.md + SOUL.md via agent's model ────────
  const handleInitAI = async () => {
    // Save current content before generation for diff comparison
    const oldIdentity = identityContent
    const oldSoul = soulContent

    setInitializingAI(true)
    setInitLog('')
    try {
      const res = await fetch(`/api/agents/${id}/init`, { method: 'POST' })
      if (!res.body) { setInitializingAI(false); return }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''
        for (const part of parts) {
          const dataLine = part.split('\n').find(l => l.startsWith('data:'))
          if (dataLine) {
            try {
              const d = JSON.parse(dataLine.slice(5))
              if (d.text) setInitLog(d.text)
            } catch {}
          }
        }
      }
    } catch {} finally {
      setInitializingAI(false)

      // Fetch new identity files after generation
      let newIdentity = ''
      let newSoul = ''
      try {
        const [idRes, soulRes] = await Promise.all([
          fetch(`/api/agents/${id}/workspace?file=IDENTITY.md`),
          fetch(`/api/agents/${id}/workspace?file=SOUL.md`),
        ])
        if (idRes.ok) {
          const data = await idRes.json()
          newIdentity = data.content || ''
        }
        if (soulRes.ok) {
          const data = await soulRes.json()
          newSoul = data.content || ''
        }
      } catch {}

      // If content changed, show diff review; otherwise just update
      if ((oldIdentity && newIdentity && oldIdentity !== newIdentity) ||
          (oldSoul && newSoul && oldSoul !== newSoul)) {
        setDiffData({ oldIdentity, newIdentity, oldSoul, newSoul })
        setShowDiffReview(true)
        // Temporarily update display with new content
        setIdentityContent(newIdentity)
        setSoulContent(newSoul)
      } else {
        // No meaningful diff or first-time generation — just update
        setIdentityContent(newIdentity)
        setSoulContent(newSoul)
      }
    }
  }

  // ── Handle diff review accept/cancel ────────────────────────────
  const handleDiffAccept = async (identity: string, soul: string) => {
    // Write the chosen content back
    try {
      await Promise.all([
        fetch(`/api/agents/${id}/workspace`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file: 'IDENTITY.md', content: identity }),
        }),
        fetch(`/api/agents/${id}/workspace`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file: 'SOUL.md', content: soul }),
        }),
      ])
    } catch {}
    setIdentityContent(identity)
    setSoulContent(soul)
    setShowDiffReview(false)
    setDiffData(null)
  }

  const handleDiffCancel = async () => {
    // Revert to old content
    if (diffData) {
      try {
        await Promise.all([
          fetch(`/api/agents/${id}/workspace`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: 'IDENTITY.md', content: diffData.oldIdentity }),
          }),
          fetch(`/api/agents/${id}/workspace`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: 'SOUL.md', content: diffData.oldSoul }),
          }),
        ])
      } catch {}
      setIdentityContent(diffData.oldIdentity)
      setSoulContent(diffData.oldSoul)
    }
    setShowDiffReview(false)
    setDiffData(null)
  }

  // ── Auto-init: poll gateway then trigger init ───────────────────
  useEffect(() => {
    const autoInit = searchParams.get('autoInit')
    if (autoInit !== 'true' || autoInitTriggered.current) return
    autoInitTriggered.current = true

    // Clear URL param to prevent re-trigger on refresh
    router.replace(`/agents/${id}`)

    const pollAndInit = async () => {
      setWaitingForGateway(true)
      let attempts = 0
      const maxAttempts = 30

      while (attempts < maxAttempts) {
        try {
          const res = await fetch('/api/gateway/status')
          if (res.ok) {
            const data = await res.json()
            if (data.status === 'running') break
          }
        } catch {}
        attempts++
        await new Promise(r => setTimeout(r, 2000))
      }

      setWaitingForGateway(false)
      handleInitAI()
    }

    pollAndInit()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleSkill = async (slug: string) => {
    const updated = skills.map(s =>
      s.slug === slug ? { ...s, enabled: !s.enabled } : s
    )
    setSkills(updated)
    setSavingSkills(true)
    try {
      await fetch(`/api/agents/${id}/skills`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills: updated.filter(s => s.enabled).map(s => s.slug) }),
      })
    } catch {} finally { setSavingSkills(false) }
  }

  const enableAllSkills = async () => {
    const updated = skills.map(s => ({ ...s, enabled: true }))
    setSkills(updated)
    setSavingSkills(true)
    try {
      await fetch(`/api/agents/${id}/skills`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills: updated.map(s => s.slug) }),
      })
    } catch {} finally { setSavingSkills(false) }
  }

  const disableAllSkills = async () => {
    const updated = skills.map(s => ({ ...s, enabled: false }))
    setSkills(updated)
    setSavingSkills(true)
    try {
      await fetch(`/api/agents/${id}/skills`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills: [] }),
      })
    } catch {} finally { setSavingSkills(false) }
  }

  useEffect(() => {
    fetchFiles()
    fetchSessions()
    fetchSkills()
    fetchIdentityFiles()
    // Fetch agent.json for peers/skills config
    fetch(`/api/agents/${id}/workspace?file=agent.json`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.content) try { setAgentConfig(JSON.parse(data.content)) } catch {} })
      .catch(() => {})
  }, [fetchFiles, fetchSessions, fetchSkills, fetchIdentityFiles, id])

  if (!agent) {
    return (
      <div className="space-y-4">
        <Link href="/agents" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> {t('agents.title')}
        </Link>
        <div className="text-center py-16 text-muted-foreground">
          <p>Agent "{id}" not found</p>
        </div>
      </div>
    )
  }

  const roleIcon = ({ pm: '📋', product: '📦', designer: '🎨', frontend: '💻', backend: '⚙️', tester: '🧪', researcher: '🔬' } as Record<string, string>)[agent.role] || '🤖'

  // ── Tab content components ─────────────────────────────────────
  const InfoTab = () => (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-xl bg-accent flex items-center justify-center text-2xl">
            {roleIcon}
          </div>
          <div>
            <h2 className="text-lg font-bold">{agent.name}</h2>
            <p className="text-sm text-muted-foreground">{agent.role}</p>
          </div>
          <Badge variant={agent.status === 'online' ? 'success' : agent.status === 'busy' ? 'warning' : 'muted'} className="ml-auto">
            {agent.status}
          </Badge>
        </div>

        <p className="text-sm text-muted-foreground">{agent.description}</p>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground mb-1">{t('agents.assignedModel')}</p>
            <p className="text-sm font-mono">{model}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground mb-1">Token {t('common.total')}</p>
            <p className="text-sm font-semibold">{formatNumber(agent.tokensUsed)}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground mb-1">{t('common.completed')}</p>
            <p className="text-sm font-semibold">{agent.tasksCompleted}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground mb-1">{t('common.inProgress')}</p>
            <p className="text-sm font-semibold">{agent.tasksInProgress}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground mb-1">{t('common.messages')}</p>
            <p className="text-sm font-semibold">{formatNumber(agent.messagesCount)}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground mb-1">{t('agents.sessions')}</p>
            <p className="text-sm font-semibold">{sessions.length}</p>
          </div>
        </div>

        {/* Peers */}
        {(agentConfig?.peers?.length ?? 0) > 0 && (
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground mb-2">{t('agents.peers')}</p>
            <div className="flex flex-wrap gap-1.5">
              {agentConfig!.peers!.map(peerId => {
                const peerIcon = ({ pm: '📋', product: '📦', designer: '🎨', frontend: '💻', backend: '⚙️', tester: '🧪', researcher: '🔬' } as Record<string, string>)[peerId] || '🤖'
                return (
                  <Link key={peerId} href={`/agents/${peerId}`}
                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-accent text-xs hover:bg-accent/80 transition-colors">
                    <span>{peerIcon}</span>
                    <span>{peerId}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* Identity & Soul section */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            {t('agents.identitySection')}
          </h3>

          {/* Waiting for gateway indicator */}
          {waitingForGateway && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20 text-sm text-primary">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('agents.waitingForGateway')}
            </div>
          )}

          {/* IDENTITY.md */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border">
              <span className="text-xs font-medium font-mono">IDENTITY.md</span>
              <div className="flex gap-1">
                {editingIdentity ? (
                  <>
                    <button
                      onClick={() => setEditingIdentity(false)}
                      className="p-1 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => saveIdentityFile('IDENTITY.md', editIdentityDraft)}
                      disabled={savingIdentity}
                      className="p-1 text-primary hover:text-primary/80 disabled:opacity-50"
                    >
                      {savingIdentity ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => { setEditIdentityDraft(identityContent); setEditingIdentity(true) }}
                    className="p-1 text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            {editingIdentity ? (
              <textarea
                value={editIdentityDraft}
                onChange={e => setEditIdentityDraft(e.target.value)}
                rows={8}
                className="w-full bg-muted/10 px-3 py-2 text-xs font-mono text-foreground focus:outline-none resize-y"
              />
            ) : (
              <pre className="px-3 py-2 text-xs font-mono whitespace-pre-wrap break-words max-h-40 overflow-y-auto text-muted-foreground">
                {identityContent || '—'}
              </pre>
            )}
          </div>

          {/* SOUL.md */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border">
              <span className="text-xs font-medium font-mono">SOUL.md</span>
              <div className="flex gap-1">
                {editingSoul ? (
                  <>
                    <button
                      onClick={() => setEditingSoul(false)}
                      className="p-1 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => saveIdentityFile('SOUL.md', editSoulDraft)}
                      disabled={savingSoul}
                      className="p-1 text-primary hover:text-primary/80 disabled:opacity-50"
                    >
                      {savingSoul ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => { setEditSoulDraft(soulContent); setEditingSoul(true) }}
                    className="p-1 text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            {editingSoul ? (
              <textarea
                value={editSoulDraft}
                onChange={e => setEditSoulDraft(e.target.value)}
                rows={6}
                className="w-full bg-muted/10 px-3 py-2 text-xs font-mono text-foreground focus:outline-none resize-y"
              />
            ) : (
              <pre className="px-3 py-2 text-xs font-mono whitespace-pre-wrap break-words max-h-40 overflow-y-auto text-muted-foreground">
                {soulContent || '—'}
              </pre>
            )}
          </div>
        </div>

        {/* Config actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSyncConfig}
            disabled={syncingConfig}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title="Regenerate TOOLS.md from agent.json skills[]"
          >
            {syncingConfig ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Sync Config
          </button>
          <button
            onClick={handleInitAI}
            disabled={initializingAI || waitingForGateway}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors disabled:opacity-50"
            title="Let the agent generate its own IDENTITY.md + SOUL.md using its model"
          >
            {initializingAI ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {initializingAI ? t('agents.initializingIdentity') : t('agents.regenerateIdentity')}
          </button>
        </div>
        {initLog && (
          <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 max-h-24 overflow-y-auto whitespace-pre-wrap">
            {initLog}
          </div>
        )}
      </CardContent>
    </Card>
  )

  const SessionsTab = () => (
    <div className="space-y-3">
      {loadingSessions ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          {t('agents.noSessions')}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Session list */}
          <div className="space-y-2">
            {sessions.map(s => (
              <button
                key={s.key}
                onClick={() => fetchMessages(s.key)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  selectedSession === s.key
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/30'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium truncate">{s.key}</span>
                  <Badge variant="muted" className="text-[10px]">{s.kind}</Badge>
                </div>
                {s.lastMessage && (
                  <p className="text-xs text-muted-foreground truncate">{s.lastMessage}</p>
                )}
                <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                  {s.messageCount && <span>{s.messageCount} msgs</span>}
                  {s.lastAt && <span>{timeAgo(s.lastAt)}</span>}
                </div>
              </button>
            ))}
          </div>

          {/* Message viewer */}
          <Card className="max-h-[60vh] overflow-y-auto">
            <CardContent className="p-4">
              {loadingMessages ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : selectedSession ? (
                <div className="space-y-3">
                  {messages.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">{t('agents.noMessages')}</p>
                  ) : messages.map((m, i) => (
                    <div key={i} className={`p-3 rounded-lg ${
                      m.role === 'assistant' ? 'bg-primary/5 border border-primary/20' :
                      m.role === 'user' ? 'bg-muted/50' : 'bg-muted/30'
                    }`}>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={m.role === 'assistant' ? 'default' : 'muted'} className="text-[10px]">
                          {m.role}
                        </Badge>
                        {m.timestamp && (
                          <span className="text-[10px] text-muted-foreground">{timeAgo(m.timestamp)}</span>
                        )}
                      </div>
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {typeof m.content === 'string' ? m.content.slice(0, 2000) : JSON.stringify(m.content).slice(0, 2000)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">{t('agents.selectSession')}</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )

  const FilesTab = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {/* File list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t('agents.workspaceFiles')}</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingFiles ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : files.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">{t('agents.noFiles')}</p>
          ) : (
            <div className="space-y-1">
              {files.map(f => (
                <button
                  key={f.path}
                  onClick={() => f.type === 'file' && fetchFileContent(f.path, f.name)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    fileContent?.name === f.name ? 'bg-primary/10' : 'hover:bg-muted/50'
                  } ${f.type === 'directory' ? 'text-muted-foreground' : 'cursor-pointer'}`}
                >
                  {f.type === 'directory'
                    ? <FolderTree className="w-4 h-4 text-amber-400 shrink-0" />
                    : <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                  }
                  <span className="truncate">{f.name}</span>
                  {f.size !== undefined && (
                    <span className="ml-auto text-xs text-muted-foreground">{formatNumber(f.size)}B</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* File preview */}
      <Card className="max-h-[60vh] overflow-y-auto">
        <CardContent className="p-4">
          {fileContent ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium font-mono">{fileContent.name}</span>
                <button
                  onClick={() => setFileContent(null)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              </div>
              <pre className="text-xs font-mono whitespace-pre-wrap break-words bg-muted/30 p-3 rounded-lg max-h-[50vh] overflow-y-auto">
                {fileContent.content}
              </pre>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">{t('agents.selectFile')}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )

  const filteredSkills = skills.filter(s => {
    if (skillFilter === 'all') return true
    if (skillFilter === 'enabled') return s.enabled
    return s.source === skillFilter
  })

  const SkillsTab = () => (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-sm">{t('agents.skillManagement')}</CardTitle>
            <CardDescription className="text-xs">
              {t('agents.skillManagementDesc')}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <button
              onClick={enableAllSkills}
              disabled={savingSkills || skills.length === 0}
              className="px-2.5 py-1 text-xs rounded-md bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors"
            >
              {t('agents.enableAll')}
            </button>
            <button
              onClick={disableAllSkills}
              disabled={savingSkills || skills.length === 0}
              className="px-2.5 py-1 text-xs rounded-md bg-muted text-muted-foreground hover:bg-muted/80 disabled:opacity-50 transition-colors"
            >
              {t('agents.disableAll')}
            </button>
          </div>
        </div>
        {/* Filter bar */}
        {skills.length > 0 && (
          <div className="flex gap-1 mt-3">
            {(['all', 'enabled', 'builtin', 'project'] as const).map(f => (
              <button
                key={f}
                onClick={() => setSkillFilter(f)}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  skillFilter === f
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                }`}
              >
                {f === 'all' ? `${t('agents.filterAll')} (${skills.length})`
                  : f === 'enabled' ? `${t('agents.filterEnabled')} (${skills.filter(s => s.enabled).length})`
                  : f === 'builtin' ? `🔧 Built-in (${skills.filter(s => s.source === 'builtin').length})`
                  : `📁 Project (${skills.filter(s => s.source === 'project').length})`
                }
              </button>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {loadingSkills ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : skills.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <Puzzle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>{t('agents.noSkillsAvailable')}</p>
            <p className="text-xs mt-1">{t('agents.installSkillsFirst')}</p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredSkills.map(s => (
              <button
                key={s.slug}
                onClick={() => toggleSkill(s.slug)}
                disabled={savingSkills}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left ${
                  s.enabled
                    ? 'bg-primary/5 border border-primary/20 hover:bg-primary/10'
                    : 'bg-muted/30 border border-transparent hover:bg-muted/50'
                }`}
              >
                <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
                  s.enabled ? 'bg-primary text-primary-foreground' : 'bg-muted'
                }`}>
                  {s.enabled ? <Check className="w-3 h-3" /> : null}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-mono text-sm ${s.enabled ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {s.slug}
                    </span>
                    <Badge variant="muted" className="text-[9px] shrink-0">
                      {s.source === 'builtin' ? '🔧' : '📁'}
                    </Badge>
                  </div>
                  {s.description && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{s.description}</p>
                  )}
                </div>
              </button>
            ))}
            <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
              <span>{skills.filter(s => s.enabled).length} / {skills.length} {t('agents.skillsEnabled')}</span>
              {savingSkills && <Loader2 className="w-3 h-3 animate-spin" />}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )

  // ── Tab buttons ────────────────────────────────────────────────
  const tabs: { key: Tab; label: string; icon: typeof User }[] = [
    { key: 'info', label: t('agents.info'), icon: User },
    { key: 'chat', label: t('agents.chat'), icon: MessageSquare },
    { key: 'skills', label: t('agents.skills'), icon: Puzzle },
    { key: 'sessions', label: t('agents.sessions'), icon: Activity },
    { key: 'files', label: t('agents.files'), icon: FolderTree },
  ]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/agents" className="p-1 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-2xl">{roleIcon}</span>
          <h1 className="text-xl font-bold">{agent.name}</h1>
          <Badge variant={agent.status === 'online' ? 'success' : 'muted'}>{agent.status}</Badge>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'info' && <InfoTab />}
      {tab === 'chat' && <AgentChat agentId={id} t={t} />}
      {tab === 'sessions' && <SessionsTab />}
      {tab === 'files' && <FilesTab />}
      {tab === 'skills' && <SkillsTab />}

      {/* Identity Diff Review Modal */}
      {showDiffReview && diffData && (
        <IdentityDiffReview
          oldIdentity={diffData.oldIdentity}
          newIdentity={diffData.newIdentity}
          oldSoul={diffData.oldSoul}
          newSoul={diffData.newSoul}
          onAccept={handleDiffAccept}
          onCancel={handleDiffCancel}
        />
      )}
    </div>
  )
}
