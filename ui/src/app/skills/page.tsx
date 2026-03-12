'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useAppStore } from '@/lib/store'
import { useTranslation } from '@/lib/i18n'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Wrench, Search, Download, RefreshCw, Trash2, ExternalLink,
  Loader2, Package, Globe, CheckCircle2, AlertCircle, Info, Star,
  ChevronLeft, ChevronRight, Key, X, Save, ShieldCheck
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────
interface LocalSkill {
  id: string
  name: string
  description: string
  version: string
  enabled: boolean
  usageCount?: number
}

interface OnlineSkill {
  slug: string
  version: string
  name: string
  score?: number
  updatedAt?: string
  summary?: string
  owner?: string
}

interface InstalledSkill {
  slug: string
  version: string
  status: string
}

interface BuiltinSkill {
  name: string
  description: string
  emoji: string
  eligible: boolean
  disabled: boolean
  bundled: boolean
  homepage?: string
  missing: {
    bins: string[]
    anyBins: string[]
    env: string[]
    config: string[]
    os: string[]
  }
}

type Tab = 'installed' | 'builtin' | 'browse' | 'search'

const OFFICIAL_OWNERS = new Set(['openclaw', 'anthropic'])

// ── Error Banner ─────────────────────────────────────────────────
function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-2 p-3 rounded-lg border bg-destructive/10 border-destructive/30">
      <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
      <p className="text-sm flex-1">{message}</p>
      <button
        onClick={onRetry}
        className="flex items-center gap-1 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
      >
        <RefreshCw className="w-3 h-3" />
        {t('common.retry')}
      </button>
    </div>
  )
}

// ── Skill Detail Dialog ──────────────────────────────────────────
function SkillDetailDialog({ slug, onClose, installedSlugs, onInstall }: {
  slug: string
  onClose: () => void
  installedSlugs: Set<string>
  onInstall: (slug: string) => void
}) {
  const { t } = useTranslation()
  const [detail, setDetail] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const controller = new AbortController()
    fetch(`/api/skills/online?action=inspect&slug=${encodeURIComponent(slug)}`, { signal: controller.signal })
      .then(r => r.json())
      .then(d => setDetail(d.skill))
      .catch(() => {})
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [slug])

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto space-y-4"
        onClick={e => e.stopPropagation()}>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : detail ? (
          <>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold">{detail.name}</h3>
                <p className="text-sm text-muted-foreground font-mono">{detail.slug}</p>
              </div>
              <Badge variant="default">v{detail.version}</Badge>
            </div>
            <p className="text-sm">{detail.summary}</p>
            <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-foreground">Owner:</span> {detail.owner}
                {detail.owner && OFFICIAL_OWNERS.has(detail.owner.toLowerCase()) && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 text-[10px] font-medium">
                    <ShieldCheck className="w-3 h-3" />
                    {t('skills.official')}
                  </span>
                )}
              </div>
              <div>
                <span className="font-medium text-foreground">Updated:</span> {detail.updatedAt ? new Date(detail.updatedAt).toLocaleDateString() : '—'}
              </div>
            </div>
            {detail.tags && (
              <div className="flex gap-1 flex-wrap">
                {detail.tags.split(',').map((tag: string) => (
                  <Badge key={tag} variant="muted" className="text-[10px]">{tag.trim()}</Badge>
                ))}
              </div>
            )}
            <div className="flex gap-2 pt-2">
              {installedSlugs.has(slug) ? (
                <Badge variant="success" className="py-1.5 px-3">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> {t('skills.installed')}
                </Badge>
              ) : (
                <button
                  onClick={() => onInstall(slug)}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
                >
                  <Download className="w-3.5 h-3.5" /> {t('skills.install')}
                </button>
              )}
              <button onClick={onClose}
                className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted">
                {t('common.cancel')}
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">{t('skills.notFound')}</p>
        )}
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────
export default function SkillsPage() {
  const { skills, setSkills } = useAppStore()
  const { t } = useTranslation()

  const [tab, setTab] = useState<Tab>('installed')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<OnlineSkill[]>([])
  const [exploreResults, setExploreResults] = useState<OnlineSkill[]>([])
  const [installedFromHub, setInstalledFromHub] = useState<InstalledSkill[]>([])
  const [installing, setInstalling] = useState<string | null>(null)
  const [installResult, setInstallResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [detailSlug, setDetailSlug] = useState<string | null>(null)
  const [browsePage, setBrowsePage] = useState(1)
  const [searchPage, setSearchPage] = useState(1)
  const [builtinSkills, setBuiltinSkills] = useState<BuiltinSkill[]>([])
  const [builtinPage, setBuiltinPage] = useState(1)
  const [configSkill, setConfigSkill] = useState<BuiltinSkill | null>(null)
  const PAGE_SIZE = 12

  // Per-section loading & error states
  const [localLoading, setLocalLoading] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [installedLoading, setInstalledLoading] = useState(false)
  const [installedError, setInstalledError] = useState<string | null>(null)
  const [exploreLoading, setExploreLoading] = useState(false)
  const [exploreError, setExploreError] = useState<string | null>(null)
  const [builtinLoading, setBuiltinLoading] = useState(false)
  const [builtinError, setBuiltinError] = useState<string | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)

  // Track which tabs have been loaded
  const loadedTabs = useRef(new Set<string>())
  const abortRef = useRef<AbortController | null>(null)

  // ── Fetch helpers with abort support ────────────────────────────
  const makeFetchSignal = useCallback(() => {
    const timeoutSignal = AbortSignal.timeout(30000)
    if (abortRef.current) {
      return AbortSignal.any([abortRef.current.signal, timeoutSignal])
    }
    return timeoutSignal
  }, [])

  const errorMessage = useCallback((e: unknown): string => {
    if (e instanceof DOMException && e.name === 'AbortError') return ''
    if (e instanceof DOMException && e.name === 'TimeoutError') return t('skills.fetchTimeout')
    return t('skills.fetchFailed')
  }, [t])

  // ── Fetch local filesystem skills ────────────────────────────────
  const fetchLocalSkills = useCallback(async () => {
    setLocalLoading(true)
    setLocalError(null)
    try {
      const res = await fetch('/api/skills', { signal: makeFetchSignal() })
      if (res.ok) {
        const data = await res.json()
        setSkills(data.skills || [])
      } else {
        setLocalError(t('skills.fetchFailed'))
      }
    } catch (e) {
      const msg = errorMessage(e)
      if (msg) setLocalError(msg)
    } finally {
      setLocalLoading(false)
    }
  }, [setSkills, makeFetchSignal, errorMessage, t])

  // ── Fetch installed from clawhub ───────────────────────────────
  const fetchInstalled = useCallback(async () => {
    setInstalledLoading(true)
    setInstalledError(null)
    try {
      const res = await fetch('/api/skills/manage', { signal: makeFetchSignal() })
      if (res.ok) {
        const data = await res.json()
        setInstalledFromHub(data.installed || [])
      } else {
        setInstalledError(t('skills.fetchFailed'))
      }
    } catch (e) {
      const msg = errorMessage(e)
      if (msg) setInstalledError(msg)
    } finally {
      setInstalledLoading(false)
    }
  }, [makeFetchSignal, errorMessage, t])

  // ── Fetch explore ──────────────────────────────────────────────
  const fetchExplore = useCallback(async () => {
    setExploreLoading(true)
    setExploreError(null)
    try {
      const res = await fetch('/api/skills/online?action=explore&limit=100', { signal: makeFetchSignal() })
      if (res.ok) {
        const data = await res.json()
        setExploreResults(data.results || [])
        setBrowsePage(1)
      } else {
        setExploreError(t('skills.fetchFailed'))
      }
    } catch (e) {
      const msg = errorMessage(e)
      if (msg) setExploreError(msg)
    } finally {
      setExploreLoading(false)
      loadedTabs.current.add('browse')
    }
  }, [makeFetchSignal, errorMessage, t])

  // ── Fetch builtin skills ─────────────────────────────────────────
  const fetchBuiltinSkills = useCallback(async () => {
    setBuiltinLoading(true)
    setBuiltinError(null)
    try {
      const res = await fetch('/api/skills/builtin', { signal: makeFetchSignal() })
      if (res.ok) {
        const data = await res.json()
        setBuiltinSkills(data.skills || [])
      } else {
        setBuiltinError(t('skills.fetchFailed'))
      }
    } catch (e) {
      const msg = errorMessage(e)
      if (msg) setBuiltinError(msg)
    } finally {
      setBuiltinLoading(false)
      loadedTabs.current.add('builtin')
    }
  }, [makeFetchSignal, errorMessage, t])

  // ── Search ─────────────────────────────────────────────────────
  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setSearchLoading(true)
    setTab('search')
    try {
      const res = await fetch(`/api/skills/online?action=search&q=${encodeURIComponent(searchQuery)}&limit=20`, { signal: makeFetchSignal() })
      if (res.ok) {
        const data = await res.json()
        setSearchResults(data.results || [])
        setSearchPage(1)
      }
    } catch {} finally { setSearchLoading(false) }
  }

  // ── Install ────────────────────────────────────────────────────
  const handleInstall = async (slug: string) => {
    setInstalling(slug)
    setInstallResult(null)
    try {
      const res = await fetch('/api/skills/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'install', slug }),
      })
      const data = await res.json()
      setInstallResult({
        ok: data.ok,
        message: data.ok ? `${slug} ${t('skills.installSuccess')}` : (data.output || t('skills.installFailed')),
      })
      if (data.ok) {
        // Reset loaded tabs to force refresh
        loadedTabs.current.clear()
        loadedTabs.current.add('installed')
        fetchInstalled()
        fetchLocalSkills()
      }
    } catch (e: any) {
      setInstallResult({ ok: false, message: e.message })
    } finally { setInstalling(null) }
  }

  // ── Uninstall ──────────────────────────────────────────────────
  const handleUninstall = async (slug: string) => {
    if (!confirm(`${t('skills.confirmUninstall')} "${slug}"?`)) return
    try {
      await fetch('/api/skills/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'uninstall', slug }),
      })
      loadedTabs.current.clear()
      loadedTabs.current.add('installed')
      fetchInstalled(); fetchLocalSkills()
    } catch {}
  }

  // ── Update all ─────────────────────────────────────────────────
  const handleUpdateAll = async () => {
    setInstalling('__all__')
    setInstallResult(null)
    try {
      const res = await fetch('/api/skills/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-all' }),
      })
      const data = await res.json()
      setInstallResult({
        ok: data.ok,
        message: data.ok ? t('skills.updateAllSuccess') : (data.output || t('skills.updateFailed')),
      })
      if (data.ok) fetchInstalled()
    } catch (e: any) {
      setInstallResult({ ok: false, message: e.message })
    } finally { setInstalling(null) }
  }

  // ── Lazy-load on tab switch ────────────────────────────────────
  useEffect(() => {
    if (tab === 'browse' && !loadedTabs.current.has('browse')) {
      fetchExplore()
    } else if (tab === 'builtin' && !loadedTabs.current.has('builtin')) {
      fetchBuiltinSkills()
    }
  }, [tab, fetchExplore, fetchBuiltinSkills])

  // ── Initial load: only installed tab data ──────────────────────
  useEffect(() => {
    abortRef.current = new AbortController()
    loadedTabs.current.add('installed')
    fetchLocalSkills()
    fetchInstalled()
    return () => {
      abortRef.current?.abort()
      abortRef.current = null
    }
  }, [fetchLocalSkills, fetchInstalled])

  const installedSlugs = new Set([
    ...skills.map(s => s.name),
    ...installedFromHub.map(s => s.slug),
  ])

  // ── Skill card (online) ────────────────────────────────────────
  const OnlineSkillCard = ({ skill }: { skill: OnlineSkill }) => {
    const isInstalled = installedSlugs.has(skill.slug)
    const isInstalling = installing === skill.slug

    return (
      <Card className="hover:border-primary/30 transition-colors">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <button
                onClick={() => setDetailSlug(skill.slug)}
                className="font-semibold text-sm font-mono hover:text-primary transition-colors text-left"
              >
                {skill.slug}
              </button>
              <p className="text-xs text-muted-foreground mt-0.5">{skill.name}</p>
            </div>
            <Badge variant="muted" className="text-[10px] shrink-0">v{skill.version}</Badge>
          </div>

          {skill.summary && (
            <p className="text-xs text-muted-foreground line-clamp-2">{skill.summary}</p>
          )}

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              {skill.score != null && <span>⭐ {skill.score.toFixed(1)}</span>}
              {skill.updatedAt && <span>{skill.updatedAt}</span>}
              {skill.owner && <span>{t('skills.by')} {skill.owner}</span>}
            </div>
            {isInstalled ? (
              <Badge variant="success" className="text-[10px]">
                <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" /> {t('skills.installed')}
              </Badge>
            ) : (
              <button
                onClick={() => handleInstall(skill.slug)}
                disabled={isInstalling}
                className="flex items-center gap-1 px-2 py-1 text-[10px] bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
              >
                {isInstalling
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Download className="w-3 h-3" />
                }
                {t('skills.install')}
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  // ── Builtin skill card ───────────────────────────────────────
  const BuiltinSkillCard = ({ skill }: { skill: BuiltinSkill }) => {
    const hasMissing = !skill.eligible
    const missingBins = [...(skill.missing.bins || []), ...(skill.missing.anyBins || [])]
    const missingEnv = skill.missing.env || []
    const missingConfig = skill.missing.config || []

    return (
      <Card className={`transition-colors border-l-4 ${skill.eligible ? 'border-l-emerald-500' : 'border-l-amber-500/50'}`}>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="text-lg shrink-0">{skill.emoji || '🔧'}</span>
              <div className="min-w-0">
                <h3 className="font-semibold text-sm">{skill.name}</h3>
              </div>
            </div>
            <Badge variant={skill.eligible ? 'success' : 'warning'} className="text-[10px] shrink-0">
              {skill.eligible ? t('skills.ready') : t('skills.missingDeps')}
            </Badge>
          </div>

          {skill.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">{skill.description}</p>
          )}

          {hasMissing && (
            <div className="flex flex-wrap gap-1">
              {missingBins.map(b => (
                <span key={b} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded bg-red-500/15 text-red-400">
                  {t('skills.bin')}: {b}
                </span>
              ))}
              {missingEnv.map(e => (
                <span key={e} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded bg-amber-500/15 text-amber-400">
                  {t('skills.env')}: {e}
                </span>
              ))}
              {missingConfig.map(c => (
                <span key={c} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded bg-blue-500/15 text-blue-400">
                  {t('skills.config')}: {c}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              {skill.homepage && (
                <a href={skill.homepage} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary">
                  <ExternalLink className="w-3 h-3" /> {t('skills.homepage')}
                </a>
              )}
            </div>
            {hasMissing && (
              <button
                onClick={() => setConfigSkill(skill)}
                className="flex items-center gap-1 px-2 py-1 text-[10px] bg-primary text-primary-foreground rounded hover:bg-primary/90"
              >
                <Key className="w-3 h-3" /> {t('skills.configure')}
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  // ── Skill config dialog ─────────────────────────────────────
  const SkillConfigDialog = ({ skill, onClose }: { skill: BuiltinSkill; onClose: () => void }) => {
    const missingBins = [...(skill.missing.bins || []), ...(skill.missing.anyBins || [])]
    const missingEnv = skill.missing.env || []
    const missingConfig = skill.missing.config || []
    const [envValues, setEnvValues] = useState<Record<string, string>>({})
    const [saving, setSaving] = useState(false)
    const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)
    const [binStatus, setBinStatus] = useState<Record<string, 'idle' | 'installing' | 'done' | 'error'>>({})
    const [binMsg, setBinMsg] = useState<Record<string, string>>({})

    const handleBrewInstall = async (bin: string) => {
      setBinStatus(prev => ({ ...prev, [bin]: 'installing' }))
      setBinMsg(prev => ({ ...prev, [bin]: '' }))
      try {
        const res = await fetch('/api/skills/install-bin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bin }),
        })
        const data = await res.json()
        if (data.ok) {
          setBinStatus(prev => ({ ...prev, [bin]: 'done' }))
        } else {
          setBinStatus(prev => ({ ...prev, [bin]: 'error' }))
          setBinMsg(prev => ({ ...prev, [bin]: data.output || t('skills.brewFailed') }))
        }
      } catch {
        setBinStatus(prev => ({ ...prev, [bin]: 'error' }))
        setBinMsg(prev => ({ ...prev, [bin]: t('skills.brewFailed') }))
      }
    }

    const handleSave = async () => {
      const entries = Object.entries(envValues)
        .filter(([, v]) => v.trim())
        .map(([key, value]) => ({ key, value: value.trim() }))
      if (entries.length === 0) return

      setSaving(true)
      setSaveMsg(null)
      try {
        const res = await fetch('/api/env', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entries }),
        })
        if (res.ok) {
          setSaveMsg({ ok: true, text: t('skills.configSaved') })
          setTimeout(() => {
            onClose()
            fetchBuiltinSkills()
          }, 1000)
        } else {
          setSaveMsg({ ok: false, text: t('skills.configFailed') })
        }
      } catch {
        setSaveMsg({ ok: false, text: t('skills.configFailed') })
      } finally {
        setSaving(false)
      }
    }

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
        <div className="bg-card border border-border rounded-xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto space-y-4"
          onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{skill.emoji || '🔧'}</span>
              <div>
                <h3 className="text-lg font-bold">{skill.name}</h3>
                <Badge variant={skill.eligible ? 'success' : 'warning'} className="text-[10px] mt-1">
                  {skill.eligible ? t('skills.ready') : t('skills.missingDeps')}
                </Badge>
              </div>
            </div>
            <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-sm text-muted-foreground">{t('skills.configureSkill')}</p>

          {/* Missing binaries */}
          {missingBins.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-red-400">{t('skills.missingBinaries')}</h4>
              <div className="space-y-1.5">
                {missingBins.map(bin => {
                  const status = binStatus[bin] || 'idle'
                  return (
                    <div key={bin} className="space-y-1">
                      <div className="flex items-center justify-between p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                        <code className="text-xs font-mono">{bin}</code>
                        <div className="flex items-center gap-2">
                          {skill.homepage && (
                            <a href={skill.homepage} target="_blank" rel="noopener noreferrer"
                              className="text-[10px] text-primary hover:underline">
                              {t('skills.installGuide')}
                            </a>
                          )}
                          {status === 'done' ? (
                            <Badge variant="success" className="text-[10px]">
                              <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" /> {t('skills.brewInstalled')}
                            </Badge>
                          ) : (
                            <button
                              onClick={() => handleBrewInstall(bin)}
                              disabled={status === 'installing'}
                              className="flex items-center gap-1 px-2 py-1 text-[10px] bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
                            >
                              {status === 'installing'
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <Download className="w-3 h-3" />
                              }
                              {status === 'installing' ? t('skills.brewInstalling') : `brew install ${bin}`}
                            </button>
                          )}
                        </div>
                      </div>
                      {status === 'error' && binMsg[bin] && (
                        <p className="text-[10px] text-destructive px-2 line-clamp-2">{binMsg[bin]}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Missing env vars */}
          {missingEnv.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-amber-400">{t('skills.missingEnvVars')}</h4>
              <div className="space-y-2">
                {missingEnv.map(envKey => (
                  <div key={envKey} className="space-y-1">
                    <label className="text-xs font-mono text-muted-foreground">{envKey}</label>
                    <input
                      type="password"
                      value={envValues[envKey] || ''}
                      onChange={e => setEnvValues(prev => ({ ...prev, [envKey]: e.target.value }))}
                      placeholder={`Enter ${envKey}...`}
                      className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Missing gateway config */}
          {missingConfig.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-blue-400">{t('skills.missingGatewayConfig')}</h4>
              <div className="space-y-1.5">
                {missingConfig.map(cfg => (
                  <div key={cfg} className="flex items-center justify-between p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <code className="text-xs font-mono">{cfg}</code>
                    <span className="text-[10px] text-muted-foreground">{t('skills.configInOpenclaw')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Save result */}
          {saveMsg && (
            <div className={`flex items-center gap-2 p-2 rounded-lg border text-sm ${
              saveMsg.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-destructive/10 border-destructive/30 text-destructive'
            }`}>
              {saveMsg.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {saveMsg.text}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            {missingEnv.length > 0 && (
              <button
                onClick={handleSave}
                disabled={saving || Object.values(envValues).every(v => !v.trim())}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {saving ? t('common.saving') : t('common.save')}
              </button>
            )}
            <button onClick={() => {
              // Refresh skills if any bin was installed
              if (Object.values(binStatus).some(s => s === 'done')) {
                fetchBuiltinSkills()
              }
              onClose()
            }}
              className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted">
              {t('common.cancel')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Pagination ────────────────────────────────────────────────
  const Pagination = ({ page, totalPages, onPageChange }: {
    page: number; totalPages: number; onPageChange: (p: number) => void
  }) => {
    if (totalPages <= 1) return null
    return (
      <div className="flex items-center justify-center gap-2 pt-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="flex items-center gap-1 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" /> {t('skills.prevPage')}
        </button>
        <span className="text-sm text-muted-foreground px-2">
          {t('skills.pageIndicator').replace('{current}', String(page)).replace('{total}', String(totalPages))}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="flex items-center gap-1 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t('skills.nextPage')} <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    )
  }

  // ── Tab buttons ────────────────────────────────────────────────
  const tabs: { key: Tab; label: string; icon: typeof Package }[] = [
    { key: 'installed', label: t('skills.installedTab'), icon: Package },
    { key: 'builtin', label: t('skills.builtinTab'), icon: Wrench },
    { key: 'browse', label: t('skills.browseTab'), icon: Globe },
    { key: 'search', label: t('skills.searchTab'), icon: Search },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wrench className="w-6 h-6" /> {t('skills.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t('skills.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="muted">{skills.length + installedFromHub.filter(s => !skills.some(ls => ls.name === s.slug)).length} {t('skills.totalInstalled')}</Badge>
        </div>
      </div>

      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder={t('skills.searchPlaceholder')}
            className="w-full bg-muted border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={searchLoading || !searchQuery.trim()}
          className="px-4 py-2.5 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
        >
          {t('skills.search')}
        </button>
      </div>

      {/* Install result banner */}
      {installResult && (
        <div className={`flex items-start gap-2 p-3 rounded-lg border ${
          installResult.ok ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-destructive/10 border-destructive/30'
        }`}>
          {installResult.ok
            ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            : <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          }
          <p className="text-sm flex-1">{installResult.message}</p>
          <button onClick={() => setInstallResult(null)} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
        </div>
      )}

      {/* Tabs */}
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

      {/* Tab Content */}
      {tab === 'installed' && (
        <div className="space-y-4">
          {/* Error banners */}
          {localError && <ErrorBanner message={localError} onRetry={fetchLocalSkills} />}
          {installedError && <ErrorBanner message={installedError} onRetry={fetchInstalled} />}

          {/* Loading state */}
          {(localLoading || installedLoading) && skills.length === 0 && installedFromHub.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Update all button */}
          {installedFromHub.length > 0 && (
            <div className="flex justify-end">
              <button
                onClick={handleUpdateAll}
                disabled={installing === '__all__'}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted disabled:opacity-50"
              >
                {installing === '__all__'
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <RefreshCw className="w-3 h-3" />
                }
                {t('skills.updateAll')}
              </button>
            </div>
          )}

          {/* Local skills (from filesystem) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {skills.map(s => (
              <Card key={s.id} className={`transition-colors ${s.enabled ? '' : 'opacity-60'}`}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm font-mono">{s.name}</h3>
                    <Badge variant="muted">v{s.version}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{s.description || '—'}</p>
                  <div className="flex items-center justify-between pt-1">
                    <Badge
                      variant={s.source === 'builtin' ? 'default' : s.source === 'project' ? 'success' : 'muted'}
                      className="text-[10px]"
                    >
                      {s.source === 'builtin' ? '🔧 Built-in' : s.source === 'project' ? '📁 Project' : s.enabled ? t('common.active') : t('common.disabled')}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* ClawHub installed skills (exclude those already shown from filesystem) */}
            {installedFromHub.filter(s => !skills.some(ls => ls.name === s.slug)).map(s => (
              <Card key={s.slug}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm font-mono">{s.slug}</h3>
                    <Badge variant="muted">v{s.version}</Badge>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <Badge variant="success" className="text-[10px]">ClawHub</Badge>
                    <button
                      onClick={() => handleUninstall(s.slug)}
                      className="p-1 text-muted-foreground hover:text-destructive"
                      title={t('skills.uninstall')}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {!localLoading && !installedLoading && skills.length === 0 && installedFromHub.length === 0 && !localError && !installedError && (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>{t('skills.noInstalled')}</p>
              <button
                onClick={() => setTab('browse')}
                className="mt-3 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
              >
                {t('skills.browseTab')}
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'builtin' && (
        <div className="space-y-4">
          {/* Error banner */}
          {builtinError && <ErrorBanner message={builtinError} onRetry={fetchBuiltinSkills} />}

          {/* Stats + refresh */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {t('skills.builtinDesc')
                .replace('{eligible}', String(builtinSkills.filter(s => s.eligible).length))
                .replace('{total}', String(builtinSkills.length))}
            </p>
            <button
              onClick={fetchBuiltinSkills}
              disabled={builtinLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted disabled:opacity-50"
            >
              {builtinLoading
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <RefreshCw className="w-3 h-3" />
              }
              {t('common.refresh')}
            </button>
          </div>

          {builtinLoading && builtinSkills.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : builtinSkills.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {builtinSkills.slice((builtinPage - 1) * PAGE_SIZE, builtinPage * PAGE_SIZE).map(s => (
                  <BuiltinSkillCard key={s.name} skill={s} />
                ))}
              </div>
              <Pagination
                page={builtinPage}
                totalPages={Math.ceil(builtinSkills.length / PAGE_SIZE)}
                onPageChange={setBuiltinPage}
              />
            </>
          ) : !builtinLoading && !builtinError ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>{t('skills.noBuiltin')}</p>
            </div>
          ) : null}
        </div>
      )}

      {tab === 'browse' && (
        <div className="space-y-4">
          {/* Error banner */}
          {exploreError && <ErrorBanner message={exploreError} onRetry={fetchExplore} />}

          {exploreLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {exploreResults.slice((browsePage - 1) * PAGE_SIZE, browsePage * PAGE_SIZE).map(s => (
                  <OnlineSkillCard key={s.slug} skill={s} />
                ))}
              </div>
              <Pagination
                page={browsePage}
                totalPages={Math.ceil(exploreResults.length / PAGE_SIZE)}
                onPageChange={setBrowsePage}
              />
            </>
          )}
          {!exploreLoading && exploreResults.length === 0 && !exploreError && (
            <p className="text-center py-8 text-muted-foreground text-sm">{t('skills.noResults')}</p>
          )}
        </div>
      )}

      {tab === 'search' && (
        <div className="space-y-4">
          {searchLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {searchResults.slice((searchPage - 1) * PAGE_SIZE, searchPage * PAGE_SIZE).map(s => (
                  <OnlineSkillCard key={s.slug} skill={s} />
                ))}
              </div>
              <Pagination
                page={searchPage}
                totalPages={Math.ceil(searchResults.length / PAGE_SIZE)}
                onPageChange={setSearchPage}
              />
            </>
          )}
          {!searchLoading && searchResults.length === 0 && searchQuery && (
            <p className="text-center py-8 text-muted-foreground text-sm">
              {t('skills.noResults')} "{searchQuery}"
            </p>
          )}
        </div>
      )}

      {/* Detail Dialog */}
      {detailSlug && (
        <SkillDetailDialog
          slug={detailSlug}
          onClose={() => setDetailSlug(null)}
          installedSlugs={installedSlugs}
          onInstall={handleInstall}
        />
      )}

      {/* Builtin Skill Config Dialog */}
      {configSkill && (
        <SkillConfigDialog
          skill={configSkill}
          onClose={() => setConfigSkill(null)}
        />
      )}
    </div>
  )
}
