'use client'
import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { useTranslation } from '@/lib/i18n'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Settings, Wifi, Key, Server, Globe, Activity, RefreshCw, Play, Square, Loader2, AlertCircle, Download, CheckCircle2, ArrowUpCircle, Wrench, Save, Users, Eye, Terminal, FolderLock, Brain } from 'lucide-react'
import { logError } from '@/lib/error-logger'
import PluginsTab from '@/components/plugins-tab'
import { Puzzle } from 'lucide-react'

function Input({ label, value, onChange, type = 'text', placeholder = '' }: {
  label: string; value: string | number; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      />
    </div>
  )
}

// Gateway status indicator
type GwStatus = 'running' | 'stopped' | 'starting' | 'no-key' | 'error'

function GatewayControl() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<GwStatus>('stopped')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/gateway/status')
      const data = await res.json()
      setStatus(data.status)
    } catch { setStatus('error') }
  }, [])

  useEffect(() => {
    fetchStatus()
    const timer = setInterval(fetchStatus, 5000)
    return () => clearInterval(timer)
  }, [fetchStatus])

  const handleAction = async (action: 'start' | 'stop' | 'restart') => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/gateway/${action}`, { method: 'POST' })
      const data = await res.json()
      if (!data.ok) setError(data.error || 'Action failed')
      await fetchStatus()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const statusBadge = {
    running: <Badge variant="success"><Activity className="w-3 h-3 mr-1" /> Running</Badge>,
    stopped: <Badge variant="destructive"><Square className="w-3 h-3 mr-1" /> Stopped</Badge>,
    starting: <Badge variant="default"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Starting</Badge>,
    'no-key': <Badge variant="destructive"><Key className="w-3 h-3 mr-1" /> No API Key</Badge>,
    error: <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" /> Error</Badge>,
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="w-4 h-4" /> Internal Gateway
            </CardTitle>
            <CardDescription>Built-in OpenClaw Gateway on port 19100</CardDescription>
          </div>
          {statusBadge[status]}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          {status !== 'running' && status !== 'starting' && (
            <button
              onClick={() => handleAction('start')}
              disabled={loading || status === 'no-key'}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              Start
            </button>
          )}
          {status === 'running' && (
            <>
              <button
                onClick={() => handleAction('stop')}
                disabled={loading}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 disabled:opacity-50"
              >
                <Square className="w-3.5 h-3.5" /> Stop
              </button>
              <button
                onClick={() => handleAction('restart')}
                disabled={loading}
                className="flex items-center gap-1.5 px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Restart
              </button>
            </>
          )}
        </div>
        {error && (
          <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}
        {status === 'no-key' && (
          <p className="text-sm text-muted-foreground">
            Add at least one provider with an API key below, then start the Gateway.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// OpenClaw Update Card
function OpenClawUpdateCard() {
  const { t } = useTranslation()
  const [current, setCurrent] = useState<string>('—')
  const [latest, setLatest] = useState<string>('—')
  const [hasUpdate, setHasUpdate] = useState(false)
  const [checking, setChecking] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [checkedAt, setCheckedAt] = useState<string | null>(null)
  const [updateResult, setUpdateResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [targetVersion, setTargetVersion] = useState('')
  const [versions, setVersions] = useState<string[]>([])

  const checkUpdate = useCallback(async () => {
    setChecking(true)
    setUpdateResult(null)
    try {
      const res = await fetch('/api/gateway/update')
      const data = await res.json()
      setCurrent(data.current)
      setLatest(data.latest)
      setHasUpdate(data.hasUpdate)
      setCheckedAt(data.checkedAt)
      if (data.versions) setVersions(data.versions)
    } catch {
      setUpdateResult({ ok: false, message: 'Failed to check for updates' })
    } finally {
      setChecking(false)
    }
  }, [])

  const doUpdate = async (version?: string) => {
    setUpdating(true)
    setUpdateResult(null)
    try {
      const res = await fetch('/api/gateway/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(version ? { version } : {}),
      })
      const data = await res.json()
      if (data.ok) {
        setUpdateResult({
          ok: true,
          message: data.updated
            ? `${t('settings.updateSuccess')}: ${data.previousVersion} → ${data.currentVersion}${data.restarted ? '. Gateway ' + t('settings.restarted') : '. ' + t('settings.restartRequired')}`
            : t('settings.upToDate'),
        })
        setCurrent(data.currentVersion)
        if (data.updated) {
          setHasUpdate(false)
        } else {
          setHasUpdate(false)
        }
      } else {
        setUpdateResult({ ok: false, message: data.error || t('settings.updateFailed') })
      }
    } catch (e: unknown) {
      setUpdateResult({ ok: false, message: e instanceof Error ? e.message : t('settings.updateFailed') })
    } finally {
      setUpdating(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Download className="w-4 h-4" /> {t('settings.openclawUpdate')}
            </CardTitle>
            <CardDescription>{t('settings.openclawUpdateDesc')}</CardDescription>
          </div>
          {hasUpdate ? (
            <Badge variant="default" className="bg-amber-500/20 text-amber-400 border-amber-500/30">
              <ArrowUpCircle className="w-3 h-3 mr-1" /> {t('settings.updateAvailable')}
            </Badge>
          ) : current !== '—' && (
            <Badge variant="success">
              <CheckCircle2 className="w-3 h-3 mr-1" /> {t('settings.upToDate')}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Version info */}
        <div className="grid grid-cols-2 gap-4">
          <div className="px-4 py-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground mb-1">{t('settings.currentVersion')}</p>
            <p className="text-sm font-mono font-semibold">{current}</p>
          </div>
          <div className="px-4 py-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground mb-1">{t('settings.latestVersion')}</p>
            <p className="text-sm font-mono font-semibold">{latest}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={checkUpdate}
            disabled={checking || updating}
            className="flex items-center gap-1.5 px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted disabled:opacity-50"
          >
            {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {checking ? t('settings.checking') : t('settings.checkUpdate')}
          </button>
          {hasUpdate && (
            <button
              onClick={() => doUpdate()}
              disabled={updating}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {updating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {updating ? t('settings.updating') : t('settings.doUpdate')}
            </button>
          )}
        </div>

        {/* Install specific version */}
        {versions.length > 0 && (
          <div className="flex gap-2">
            <select
              value={targetVersion}
              onChange={e => setTargetVersion(e.target.value)}
              className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">{t('settings.selectVersion')}</option>
              {versions.map(v => (
                <option key={v} value={v}>{v}{v === current ? ` (${t('settings.currentLabel')})` : ''}</option>
              ))}
            </select>
            <button
              onClick={() => doUpdate(targetVersion)}
              disabled={updating || !targetVersion}
              className="flex items-center gap-1.5 px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted disabled:opacity-50 whitespace-nowrap"
            >
              {updating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {t('settings.installVersion')}
            </button>
          </div>
        )}

        {/* Result message */}
        {updateResult && (
          <div className={`flex items-start gap-2 p-3 rounded-lg border ${
            updateResult.ok
              ? 'bg-emerald-500/10 border-emerald-500/30'
              : 'bg-destructive/10 border-destructive/30'
          }`}>
            {updateResult.ok
              ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              : <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            }
            <p className="text-sm">{updateResult.message}</p>
          </div>
        )}

        {/* Last checked */}
        {checkedAt && (
          <p className="text-xs text-muted-foreground">
            Last checked: {new Date(checkedAt).toLocaleString()}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// Platform (Agent Factory) Update Card
function PlatformUpdateCard() {
  const { t } = useTranslation()
  const [current, setCurrent] = useState<string>('—')
  const [latest, setLatest] = useState<string>('—')
  const [hasUpdate, setHasUpdate] = useState(false)
  const [checking, setChecking] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [checkedAt, setCheckedAt] = useState<string | null>(null)
  const [updateResult, setUpdateResult] = useState<{ ok: boolean; message: string } | null>(null)

  const checkUpdate = useCallback(async () => {
    setChecking(true)
    setUpdateResult(null)
    try {
      const res = await fetch('/api/platform/update')
      const data = await res.json()
      setCurrent(data.current)
      setLatest(data.latest)
      setHasUpdate(data.hasUpdate)
      setCheckedAt(data.checkedAt)
    } catch {
      setUpdateResult({ ok: false, message: t('settings.updateFailed') })
    } finally {
      setChecking(false)
    }
  }, [t])

  const doUpdate = async () => {
    setUpdating(true)
    setUpdateResult(null)
    try {
      const res = await fetch('/api/platform/update', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setUpdateResult({
          ok: true,
          message: data.updated
            ? `${t('settings.updateSuccess')}: v${data.previousVersion} → v${data.currentVersion}`
            : t('settings.upToDate'),
        })
        if (data.updated) {
          setCurrent(data.currentVersion)
          setHasUpdate(false)
        }
      } else {
        setUpdateResult({ ok: false, message: data.error || t('settings.updateFailed') })
      }
    } catch (e: unknown) {
      setUpdateResult({ ok: false, message: e instanceof Error ? e.message : t('settings.updateFailed') })
    } finally {
      setUpdating(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowUpCircle className="w-4 h-4" /> {t('settings.platformUpdate')}
            </CardTitle>
            <CardDescription>{t('settings.platformUpdateDesc')}</CardDescription>
          </div>
          {hasUpdate ? (
            <Badge variant="default" className="bg-amber-500/20 text-amber-400 border-amber-500/30">
              <ArrowUpCircle className="w-3 h-3 mr-1" /> {t('settings.updateAvailable')}
            </Badge>
          ) : current !== '—' && (
            <Badge variant="success">
              <CheckCircle2 className="w-3 h-3 mr-1" /> {t('settings.upToDate')}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Version info */}
        <div className="grid grid-cols-2 gap-4">
          <div className="px-4 py-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground mb-1">{t('settings.currentVersion')}</p>
            <p className="text-sm font-mono font-semibold">v{current}</p>
          </div>
          <div className="px-4 py-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground mb-1">{t('settings.latestVersion')}</p>
            <p className="text-sm font-mono font-semibold">v{latest}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={checkUpdate}
            disabled={checking || updating}
            className="flex items-center gap-1.5 px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted disabled:opacity-50"
          >
            {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {checking ? t('settings.checking') : t('settings.checkUpdate')}
          </button>
          {hasUpdate && (
            <button
              onClick={doUpdate}
              disabled={updating}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {updating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {updating ? t('settings.updating') : t('settings.doUpdate')}
            </button>
          )}
        </div>

        {/* Result message */}
        {updateResult && (
          <div className={`flex items-start gap-2 p-3 rounded-lg border ${
            updateResult.ok
              ? 'bg-emerald-500/10 border-emerald-500/30'
              : 'bg-destructive/10 border-destructive/30'
          }`}>
            {updateResult.ok
              ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              : <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            }
            <p className="text-sm">{updateResult.message}</p>
          </div>
        )}

        {/* Last checked */}
        {checkedAt && (
          <p className="text-xs text-muted-foreground">
            Last checked: {new Date(checkedAt).toLocaleString()}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ── OpenClaw Tools Tab ──────────────────────────────────────────────
type SettingsTab = 'general' | 'tools' | 'plugins'


interface ToolsConfig {
  agentToAgent?: { enabled?: boolean; allow?: string[] }
  sessions?: { visibility?: string }
  exec?: { security?: string; timeoutSec?: number; applyPatch?: { enabled?: boolean } }
  loopDetection?: { enabled?: boolean; warningThreshold?: number; criticalThreshold?: number }
  fs?: { workspaceOnly?: boolean }
  [key: string]: unknown
}

function OpenClawToolsTab() {
  const { t } = useTranslation()
  // Tools config state
  const [toolsConfig, setToolsConfig] = useState<ToolsConfig>({})
  const [toolsSaving, setToolsSaving] = useState<string | null>(null)
  const [toolsSaveResult, setToolsSaveResult] = useState<{ section: string; ok: boolean; message: string } | null>(null)

  // Memory config state
  const [memoryConfig, setMemoryConfig] = useState<{
    memorySearch?: { enabled?: boolean; sources?: string[]; query?: { maxResults?: number; minScore?: number; hybrid?: { enabled?: boolean; vectorWeight?: number; textWeight?: number; mmr?: { enabled?: boolean; lambda?: number }; temporalDecay?: { enabled?: boolean; halfLifeDays?: number } } } }
    compaction?: { memoryFlush?: { enabled?: boolean; softThresholdTokens?: number } }
  }>({})
  const [memorySaving, setMemorySaving] = useState(false)
  const [memorySaveResult, setMemorySaveResult] = useState<{ ok: boolean; message: string } | null>(null)

  const fetchTools = useCallback(async () => {
    try {
      const res = await fetch('/api/tools')
      const data = await res.json()
      setToolsConfig(data.tools || {})
    } catch (err) { logError('settings/fetchTools', err) }
  }, [])

  const fetchMemoryConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/memory-config')
      if (res.ok) { const data = await res.json(); setMemoryConfig(data) }
    } catch (err) { logError('settings/fetchMemoryConfig', err) }
  }, [])

  useEffect(() => { fetchTools(); fetchMemoryConfig() }, [fetchTools, fetchMemoryConfig])

  const handleToolsSave = async (section: string, toolKey: string, value: unknown) => {
    setToolsSaving(section)
    setToolsSaveResult(null)
    try {
      const res = await fetch('/api/tools', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tools: { [toolKey]: value } }),
      })
      const data = await res.json()
      if (data.ok) {
        setToolsSaveResult({ section, ok: true, message: t('settings.toolConfigSaved') })
        await fetchTools()
      } else {
        setToolsSaveResult({ section, ok: false, message: data.error || t('settings.toolConfigFailed') })
      }
    } catch {
      setToolsSaveResult({ section, ok: false, message: t('settings.toolConfigFailed') })
    } finally {
      setToolsSaving(null)
    }
  }

  const handleMemorySave = async () => {
    setMemorySaving(true); setMemorySaveResult(null)
    try {
      const res = await fetch('/api/memory-config', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(memoryConfig),
      })
      const data = await res.json()
      setMemorySaveResult({ ok: data.ok, message: data.ok ? t('settings.memoryConfigSaved') : (data.error || t('settings.memoryConfigFailed')) })
      if (data.ok) fetchMemoryConfig()
    } catch { setMemorySaveResult({ ok: false, message: t('settings.memoryConfigFailed') }) }
    finally { setMemorySaving(false) }
  }

  // Derived tools state with defaults
  const agentToAgent = toolsConfig.agentToAgent || { enabled: true, allow: ['*'] }
  const sessions = toolsConfig.sessions || { visibility: 'self' }
  const exec = toolsConfig.exec || { security: 'full', timeoutSec: 120, applyPatch: { enabled: true } }
  const loopDetection = toolsConfig.loopDetection || { enabled: false, warningThreshold: 10, criticalThreshold: 20 }
  const fsConfig = toolsConfig.fs || { workspaceOnly: false }

  return (
    <div className="space-y-6">
      {/* Memory Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="w-4 h-4" /> {t('settings.memoryConfig')}
              </CardTitle>
              <CardDescription>{t('settings.memoryConfigDesc')}</CardDescription>
            </div>
            <button
              onClick={() => {
                setMemoryConfig(prev => ({
                  ...prev,
                  memorySearch: { ...prev.memorySearch, enabled: !prev.memorySearch?.enabled },
                }))
              }}
              className={`relative w-11 h-6 rounded-full transition-colors ${memoryConfig.memorySearch?.enabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${memoryConfig.memorySearch?.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {/* Hybrid Search toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t('settings.hybridSearch')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t('settings.hybridSearchDesc')}</p>
              </div>
              <button
                onClick={() => {
                  setMemoryConfig(prev => ({
                    ...prev,
                    memorySearch: {
                      ...prev.memorySearch,
                      query: {
                        ...prev.memorySearch?.query,
                        hybrid: { ...prev.memorySearch?.query?.hybrid, enabled: !prev.memorySearch?.query?.hybrid?.enabled },
                      },
                    },
                  }))
                }}
                className={`relative w-11 h-6 rounded-full transition-colors ${memoryConfig.memorySearch?.query?.hybrid?.enabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${memoryConfig.memorySearch?.query?.hybrid?.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

            {/* Temporal Decay toggle + halfLifeDays */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t('settings.temporalDecay')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t('settings.temporalDecayDesc')}</p>
              </div>
              <button
                onClick={() => {
                  setMemoryConfig(prev => ({
                    ...prev,
                    memorySearch: {
                      ...prev.memorySearch,
                      query: {
                        ...prev.memorySearch?.query,
                        hybrid: {
                          ...prev.memorySearch?.query?.hybrid,
                          temporalDecay: { ...prev.memorySearch?.query?.hybrid?.temporalDecay, enabled: !prev.memorySearch?.query?.hybrid?.temporalDecay?.enabled },
                        },
                      },
                    },
                  }))
                }}
                className={`relative w-11 h-6 rounded-full transition-colors ${memoryConfig.memorySearch?.query?.hybrid?.temporalDecay?.enabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${memoryConfig.memorySearch?.query?.hybrid?.temporalDecay?.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

            {memoryConfig.memorySearch?.query?.hybrid?.temporalDecay?.enabled && (
              <div className="space-y-1.5 pl-4">
                <label className="text-sm font-medium">{t('settings.temporalDecayHalfLife')}</label>
                <input
                  type="number"
                  value={memoryConfig.memorySearch?.query?.hybrid?.temporalDecay?.halfLifeDays ?? 30}
                  onChange={e => {
                    const v = parseInt(e.target.value, 10)
                    if (!isNaN(v)) {
                      setMemoryConfig(prev => ({
                        ...prev,
                        memorySearch: {
                          ...prev.memorySearch,
                          query: {
                            ...prev.memorySearch?.query,
                            hybrid: {
                              ...prev.memorySearch?.query?.hybrid,
                              temporalDecay: { ...prev.memorySearch?.query?.hybrid?.temporalDecay, halfLifeDays: v },
                            },
                          },
                        },
                      }))
                    }
                  }}
                  className="w-32 bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            )}

            {/* Compaction Memory Flush toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t('settings.compactionFlush')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t('settings.compactionFlushDesc')}</p>
              </div>
              <button
                onClick={() => {
                  setMemoryConfig(prev => ({
                    ...prev,
                    compaction: {
                      ...prev.compaction,
                      memoryFlush: { ...prev.compaction?.memoryFlush, enabled: !prev.compaction?.memoryFlush?.enabled },
                    },
                  }))
                }}
                className={`relative w-11 h-6 rounded-full transition-colors ${memoryConfig.compaction?.memoryFlush?.enabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${memoryConfig.compaction?.memoryFlush?.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>

          <button
            onClick={handleMemorySave}
            disabled={memorySaving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
          >
            {memorySaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {t('common.save')}
          </button>
          {memorySaveResult && (
            <div className={`text-xs px-3 py-2 rounded-lg ${memorySaveResult.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              {memorySaveResult.message}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Divider ── */}
      <div className="flex items-center gap-3 pt-2">
        <div className="flex-1 border-t border-border" />
        <span className="text-xs text-muted-foreground font-medium">{t('settings.toolsConfigTitle')}</span>
        <div className="flex-1 border-t border-border" />
      </div>
      <p className="text-xs text-muted-foreground -mt-4">{t('settings.toolsConfigDesc')}</p>

      {/* Agent-to-Agent Communication */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4" /> {t('settings.agentComm')}
              </CardTitle>
              <CardDescription>{t('settings.agentCommDesc')}</CardDescription>
            </div>
            <button
              onClick={() => {
                const next = { ...agentToAgent, enabled: !agentToAgent.enabled }
                handleToolsSave('agentToAgent', 'agentToAgent', next)
              }}
              className={`relative w-11 h-6 rounded-full transition-colors ${agentToAgent.enabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${agentToAgent.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('settings.agentCommAllow')}</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={(agentToAgent.allow || ['*']).join(', ')}
                onChange={e => {
                  const allow = e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                  setToolsConfig(prev => ({ ...prev, agentToAgent: { ...agentToAgent, allow } }))
                }}
                placeholder={t('settings.agentCommAllowHint')}
                className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <button
                onClick={() => handleToolsSave('agentToAgent', 'agentToAgent', { ...agentToAgent, allow: (agentToAgent.allow || ['*']) })}
                disabled={toolsSaving === 'agentToAgent'}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                {toolsSaving === 'agentToAgent' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {t('common.save')}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{t('settings.agentCommAllowHint')}</p>
          </div>
          {toolsSaveResult?.section === 'agentToAgent' && (
            <div className={`text-xs px-3 py-2 rounded-lg ${toolsSaveResult.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              {toolsSaveResult.message}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Session Visibility */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Eye className="w-4 h-4" /> {t('settings.sessionVisibility')}
          </CardTitle>
          <CardDescription>{t('settings.sessionVisibilityDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: 'self', label: t('settings.visibilitySelf'), desc: t('settings.visibilitySelfDesc') },
              { value: 'tree', label: t('settings.visibilityTree'), desc: t('settings.visibilityTreeDesc') },
              { value: 'agent', label: t('settings.visibilityAgent'), desc: t('settings.visibilityAgentDesc') },
              { value: 'all', label: t('settings.visibilityAll'), desc: t('settings.visibilityAllDesc') },
            ] as const).map(opt => (
              <button
                key={opt.value}
                onClick={() => handleToolsSave('sessions', 'sessions', { ...sessions, visibility: opt.value })}
                className={`text-left p-3 rounded-lg border transition-colors ${
                  (sessions.visibility || 'self') === opt.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-primary/30'
                }`}
              >
                <div className="text-sm font-medium">{opt.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{opt.desc}</div>
              </button>
            ))}
          </div>
          {toolsSaveResult?.section === 'sessions' && (
            <div className={`text-xs px-3 py-2 rounded-lg ${toolsSaveResult.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              {toolsSaveResult.message}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Command Execution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Terminal className="w-4 h-4" /> {t('settings.execTool')}
          </CardTitle>
          <CardDescription>{t('settings.execToolDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('settings.execSecurity')}</label>
            <div className="flex gap-2">
              {([
                { value: 'deny', label: t('settings.execSecurityDeny') },
                { value: 'allowlist', label: t('settings.execSecurityAllowlist') },
                { value: 'full', label: t('settings.execSecurityFull') },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setToolsConfig(prev => ({ ...prev, exec: { ...exec, security: opt.value } }))
                  }}
                  className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                    (exec.security || 'full') === opt.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-primary/30'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('settings.execTimeout')}</label>
            <input
              type="number"
              value={exec.timeoutSec ?? 120}
              onChange={e => {
                const v = parseInt(e.target.value, 10)
                if (!isNaN(v)) setToolsConfig(prev => ({ ...prev, exec: { ...exec, timeoutSec: v } }))
              }}
              className="w-32 bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div className="flex items-center justify-between">
            <button
              onClick={() => handleToolsSave('exec', 'exec', exec)}
              disabled={toolsSaving === 'exec'}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {toolsSaving === 'exec' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {t('common.save')}
            </button>
          </div>
          {toolsSaveResult?.section === 'exec' && (
            <div className={`text-xs px-3 py-2 rounded-lg ${toolsSaveResult.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              {toolsSaveResult.message}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loop Detection */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <RefreshCw className="w-4 h-4" /> {t('settings.loopDetection')}
              </CardTitle>
              <CardDescription>{t('settings.loopDetectionDesc')}</CardDescription>
            </div>
            <button
              onClick={() => {
                const next = { ...loopDetection, enabled: !loopDetection.enabled }
                handleToolsSave('loopDetection', 'loopDetection', next)
              }}
              className={`relative w-11 h-6 rounded-full transition-colors ${loopDetection.enabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${loopDetection.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('settings.loopWarningThreshold')}</label>
              <input
                type="number"
                value={loopDetection.warningThreshold ?? 10}
                onChange={e => {
                  const v = parseInt(e.target.value, 10)
                  if (!isNaN(v)) setToolsConfig(prev => ({ ...prev, loopDetection: { ...loopDetection, warningThreshold: v } }))
                }}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('settings.loopCriticalThreshold')}</label>
              <input
                type="number"
                value={loopDetection.criticalThreshold ?? 20}
                onChange={e => {
                  const v = parseInt(e.target.value, 10)
                  if (!isNaN(v)) setToolsConfig(prev => ({ ...prev, loopDetection: { ...loopDetection, criticalThreshold: v } }))
                }}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>
          <button
            onClick={() => handleToolsSave('loopDetection', 'loopDetection', loopDetection)}
            disabled={toolsSaving === 'loopDetection'}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
          >
            {toolsSaving === 'loopDetection' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {t('common.save')}
          </button>
          {toolsSaveResult?.section === 'loopDetection' && (
            <div className={`text-xs px-3 py-2 rounded-lg ${toolsSaveResult.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              {toolsSaveResult.message}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filesystem Access */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <FolderLock className="w-4 h-4" /> {t('settings.fsTool')}
              </CardTitle>
              <CardDescription>{t('settings.fsToolDesc')}</CardDescription>
            </div>
            <button
              onClick={() => {
                const next = { ...fsConfig, workspaceOnly: !fsConfig.workspaceOnly }
                handleToolsSave('fs', 'fs', next)
              }}
              className={`relative w-11 h-6 rounded-full transition-colors ${fsConfig.workspaceOnly ? 'bg-primary' : 'bg-muted-foreground/30'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${fsConfig.workspaceOnly ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t('settings.fsWorkspaceOnly')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t('settings.fsWorkspaceOnlyDesc')}</p>
            </div>
          </div>
          {toolsSaveResult?.section === 'fs' && (
            <div className={`text-xs px-3 py-2 rounded-lg mt-3 ${toolsSaveResult.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              {toolsSaveResult.message}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function SettingsPage() {
  const mode = useAppStore(s => s.mode)
  const setMode = useAppStore(s => s.setMode)
  const settings = useAppStore(s => s.settings)
  const updateSettings = useAppStore(s => s.updateSettings)
  const { t, locale, setLocale } = useTranslation()
  const [tab, setTab] = useState<SettingsTab>('general')

  const settingsTabs: { key: SettingsTab; label: string; icon: typeof Settings }[] = [
    { key: 'general', label: t('settings.tabGeneral'), icon: Settings },
    { key: 'plugins', label: t('settings.tabPlugins'), icon: Puzzle },
    { key: 'tools', label: t('settings.tabTools'), icon: Wrench },
  ]

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Settings className="w-6 h-6" /> {t('settings.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('settings.subtitle')}</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        {settingsTabs.map(({ key, label, icon: Icon }) => (
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

      {/* General tab */}
      {tab === 'general' && (
        <>
          <GatewayControl />
          <PlatformUpdateCard />
          <OpenClawUpdateCard />

          {/* Language */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Globe className="w-4 h-4" /> {t('settings.language')}</CardTitle>
              <CardDescription>{t('settings.languageDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                {([{ key: 'zh', label: '中文' }, { key: 'en', label: 'English' }] as const).map(l => (
                  <button key={l.key} onClick={() => setLocale(l.key)}
                    className={`flex-1 p-4 rounded-lg border-2 transition-colors text-left ${
                      locale === l.key ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{l.label}</span>
                      {locale === l.key && <Badge variant="success">{t('common.active')}</Badge>}
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Mode */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Server className="w-4 h-4" /> {t('settings.runningMode')}</CardTitle>
              <CardDescription>{t('settings.runningModeDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                {(['attached', 'standalone'] as const).map(m => (
                  <button key={m} onClick={() => setMode(m)}
                    className={`flex-1 p-4 rounded-lg border-2 transition-colors text-left ${
                      mode === m ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">{t(`settings.${m}`)}</span>
                      {mode === m && <Badge variant="success">{t('common.active')}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t(`settings.${m}Desc`)}
                    </p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Connection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Wifi className="w-4 h-4" /> {t('settings.connection')}</CardTitle>
              <CardDescription>{t('settings.connectionDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                label={t('settings.gatewayUrl')}
                value={settings.gatewayUrl}
                onChange={v => updateSettings({ gatewayUrl: v })}
                placeholder="ws://127.0.0.1:19100"
              />
              <Input
                label={t('settings.standalonePort')}
                value={settings.standalonePort}
                onChange={v => updateSettings({ standalonePort: parseInt(v) || 19100 })}
                type="number"
              />
            </CardContent>
          </Card>
        </>
      )}

      {/* Plugins tab */}
      {tab === 'plugins' && <PluginsTab />}

      {/* Tools tab */}
      {tab === 'tools' && <OpenClawToolsTab />}
    </div>
  )
}
