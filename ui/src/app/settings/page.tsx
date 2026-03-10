'use client'
import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { useTranslation } from '@/lib/i18n'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Settings, Wifi, Key, Cpu, Server, Globe, Plus, Trash2, Star, Check, Activity, RefreshCw, Play, Square, Loader2, AlertCircle, Shield, Link, Download, CheckCircle2, ArrowUpCircle, Wrench, Search, Save, Users, Eye, Terminal, FolderLock, Brain } from 'lucide-react'
import { PROVIDERS, CatalogModel } from '@/lib/providers'

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

function AddProviderDialog({ onAdd, onClose }: { onAdd: (p: { name: string; entries: { key: string; value: string }[]; baseUrl?: string }) => void; onClose: () => void }) {
  const [selectedId, setSelectedId] = useState('')
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [selectedAuthIdx, setSelectedAuthIdx] = useState(0)

  const providerDef = PROVIDERS.find(p => p.id === selectedId)
  const authMethod = providerDef?.authMethods[selectedAuthIdx]

  const canSave = (): boolean => {
    if (!providerDef || !authMethod) return false
    switch (authMethod.type) {
      case 'apiKey': return !!(formValues[authMethod.envKey]?.trim())
      case 'apiKeyPair': return authMethod.fields.filter(f => f.required !== false).every(f => formValues[f.envKey]?.trim())
      case 'baseUrl': return !!(formValues[authMethod.envKey]?.trim())
      case 'setupToken': return !!(formValues._token?.trim())
      default: return false
    }
  }

  const handleSave = async () => {
    if (!providerDef || !authMethod) return
    const entries: { key: string; value: string }[] = []
    let baseUrl: string | undefined

    if (authMethod.type === 'apiKey') {
      entries.push({ key: authMethod.envKey, value: formValues[authMethod.envKey].trim() })
    } else if (authMethod.type === 'apiKeyPair') {
      for (const f of authMethod.fields) {
        const v = formValues[f.envKey]?.trim()
        if (v) entries.push({ key: f.envKey, value: v })
      }
    } else if (authMethod.type === 'baseUrl') {
      baseUrl = formValues[authMethod.envKey].trim()
      entries.push({ key: authMethod.envKey, value: baseUrl })
      if (providerDef.id === 'ollama') {
        entries.push({ key: 'OLLAMA_API_KEY', value: 'ollama-local' })
      }
    } else if (authMethod.type === 'setupToken') {
      // Save via auth-profiles API
      await fetch('/api/auth-profiles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: authMethod.provider, token: formValues._token.trim() }),
      })
      onAdd({ name: providerDef.id, entries: [], baseUrl })
      onClose()
      return
    }

    onAdd({ name: providerDef.id, entries, baseUrl })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-6 w-[480px] max-h-[80vh] overflow-y-auto space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold">Add Provider</h3>

        {/* Provider selector */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Provider</label>
          <select
            value={selectedId}
            onChange={e => { setSelectedId(e.target.value); setFormValues({}); setSelectedAuthIdx(0) }}
            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">Select a provider...</option>
            {PROVIDERS.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Auth method selector (if multiple) */}
        {providerDef && providerDef.authMethods.length > 1 && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Auth Method</label>
            <div className="flex gap-2 flex-wrap">
              {providerDef.authMethods.map((m, idx) => {
                const label = m.type === 'apiKey' ? (m.label || 'API Key') :
                  m.type === 'apiKeyPair' ? 'Credentials' :
                  m.type === 'setupToken' ? 'Setup Token' :
                  m.type === 'oauth' ? 'OAuth' :
                  m.type === 'baseUrl' ? 'Base URL' : (m as any).type
                return (
                  <button
                    key={idx}
                    onClick={() => { setSelectedAuthIdx(idx); setFormValues({}) }}
                    disabled={m.type === 'oauth'}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                      selectedAuthIdx === idx ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/30'
                    } ${m.type === 'oauth' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Dynamic form */}
        {authMethod?.type === 'apiKey' && (
          <Input label={authMethod.label || 'API Key'} value={formValues[authMethod.envKey] || ''} onChange={v => setFormValues({ ...formValues, [authMethod.envKey]: v })} type="password" placeholder={authMethod.placeholder} />
        )}

        {authMethod?.type === 'apiKeyPair' && authMethod.fields.map(f => (
          <Input key={f.envKey} label={`${f.label}${f.required !== false ? ' *' : ''}`} value={formValues[f.envKey] || ''} onChange={v => setFormValues({ ...formValues, [f.envKey]: v })} type={f.envKey.includes('SECRET') ? 'password' : 'text'} placeholder={f.placeholder} />
        ))}

        {authMethod?.type === 'setupToken' && (
          <>
            <Input label="Setup Token" value={formValues._token || ''} onChange={v => setFormValues({ ...formValues, _token: v })} type="password" placeholder={authMethod.tokenPrefix + '...'} />
            <p className="text-xs text-muted-foreground">
              Run <code className="bg-muted px-1 rounded">{authMethod.command}</code> to generate.
            </p>
          </>
        )}

        {authMethod?.type === 'baseUrl' && (
          <>
            <Input label={authMethod.label || 'Base URL'} value={formValues[authMethod.envKey] || authMethod.defaultValue} onChange={v => setFormValues({ ...formValues, [authMethod.envKey]: v })} placeholder={authMethod.placeholder} />
          </>
        )}

        {providerDef && (
          <p className="text-xs text-muted-foreground">
            Credentials saved locally. Never leave this machine.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted">Cancel</button>
          <button onClick={handleSave} disabled={!canSave()}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50">Add</button>
        </div>
      </div>
    </div>
  )
}

function AddModelDialog({ provider, onAdd, onClose }: { provider: string; onAdd: (alias: string, modelId: string) => void; onClose: () => void }) {
  const { providers: storeProviders } = useAppStore()
  const [alias, setAlias] = useState('')
  const [modelId, setModelId] = useState('')
  const [isCustom, setIsCustom] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const providerDef = PROVIDERS.find(p => p.id === provider)
  const existingModelIds = Object.values(storeProviders[provider]?.models || {})
  const catalog = (providerDef?.catalogModels || []).filter(m => !existingModelIds.includes(m.id))
  const hasCatalog = catalog.length > 0

  const canAdd = alias.trim() && modelId.trim()

  const handleSelectCatalog = (model: CatalogModel) => {
    setAlias(model.alias)
    setModelId(model.id)
    setIsCustom(false)
    setTestResult(null)
  }

  const handleTest = async () => {
    if (!modelId.trim()) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/models/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, modelId: modelId.trim() }),
      })
      const data = await res.json()
      if (data.success) {
        setTestResult({ ok: true, message: 'Model test passed' })
      } else {
        setTestResult({ ok: false, message: data.error || 'Test failed' })
      }
    } catch (e: any) {
      setTestResult({ ok: false, message: e.message || 'Test failed' })
    }
    setTesting(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-6 w-[480px] max-h-[80vh] overflow-y-auto space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold">Add Model to {provider}</h3>

        {/* Catalog model picker */}
        {hasCatalog && !isCustom && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Select Model</label>
            <div className="space-y-1 max-h-[240px] overflow-y-auto">
              {catalog.map(m => (
                <button
                  key={m.id}
                  onClick={() => handleSelectCatalog(m)}
                  className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                    modelId === m.id ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{m.name}</span>
                    <div className="flex items-center gap-1.5">
                      {m.reasoning && <Badge variant="default" className="text-[10px] px-1.5 py-0">reasoning</Badge>}
                      {m.input?.includes('image') && <Badge variant="muted" className="text-[10px] px-1.5 py-0">vision</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <code className="text-xs text-muted-foreground">{m.id}</code>
                    {m.contextWindow && <span className="text-[10px] text-muted-foreground">{Math.round(m.contextWindow / 1000)}K ctx</span>}
                  </div>
                </button>
              ))}
            </div>
            <button
              onClick={() => { setIsCustom(true); setAlias(''); setModelId(''); setTestResult(null) }}
              className="text-xs text-primary hover:text-primary/80"
            >
              Custom model ID...
            </button>
          </div>
        )}

        {/* Custom mode or no catalog */}
        {(isCustom || !hasCatalog) && (
          <>
            <div className="space-y-1.5">
              <Input label="Model ID" value={modelId} onChange={v => { setModelId(v); setTestResult(null) }} placeholder="e.g. claude-sonnet-4-20250514" />
              {hasCatalog && (
                <button
                  onClick={() => { setIsCustom(false); setAlias(''); setModelId(''); setTestResult(null) }}
                  className="text-xs text-primary hover:text-primary/80"
                >
                  Back to model list
                </button>
              )}
            </div>
          </>
        )}

        {/* Alias (always shown when a model is selected) */}
        {modelId && (
          <Input label="Alias" value={alias} onChange={setAlias} placeholder="e.g. sonnet, gpt4" />
        )}

        {/* Test button */}
        {modelId && (
          <button
            onClick={handleTest}
            disabled={!modelId.trim() || testing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted disabled:opacity-50"
          >
            {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />}
            {testing ? 'Testing...' : 'Test Model'}
          </button>
        )}

        {testResult && (
          <div className={`text-xs px-3 py-2 rounded-lg ${testResult.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
            {testResult.message}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted">Cancel</button>
          <button onClick={() => { if (alias && modelId) { onAdd(alias, modelId); onClose() } }}
            disabled={!canAdd}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50">Add</button>
        </div>
      </div>
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
    } catch (e: any) {
      setError(e.message)
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

/** Auth mode badge — shows how a provider is authenticated */
function AuthModeBadge({ provider }: { provider: ProviderInfo }) {
  switch (provider.authMode) {
    case 'setup-token':
      return (
        <Badge variant="success" className="gap-1">
          <Shield className="w-3 h-3" /> Setup Token ✓
        </Badge>
      )
    case 'oauth':
      return (
        <Badge variant="success" className="gap-1">
          <Link className="w-3 h-3" /> OAuth ✓
        </Badge>
      )
    case 'env-var':
      return (
        <Badge variant="success" className="gap-1">
          <Key className="w-3 h-3" /> Env: {provider.authDetail}
        </Badge>
      )
    case 'config':
      return <Badge variant="success">API Key ✓</Badge>
    case 'none':
    default:
      return <Badge variant="destructive">No Auth</Badge>
  }
}

// Need to import ProviderInfo type for AuthModeBadge
type ProviderInfo = import('@/lib/store').ProviderInfo

/** Unified Provider Card — shows auth status, setup token management, and models */
function ProviderCard({ providerName, provider, defaultModel, onDelete, onDeleteModel, onSetDefault, onAddModel, onAuthChange }: {
  providerName: string
  provider: ProviderInfo
  defaultModel: string
  onDelete: () => void
  onDeleteModel: (alias: string) => void
  onSetDefault: (ref: string) => void
  onAddModel: () => void
  onAuthChange: () => void
}) {
  const { t } = useTranslation()
  const [showTokenForm, setShowTokenForm] = useState(false)
  const [tokenValue, setTokenValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; error?: string }>>({})

  /** Test a model by calling POST /api/models/test */
  const handleTestModel = async (alias: string, modelId: string) => {
    setTesting(alias)
    setTestResults(prev => { const n = { ...prev }; delete n[alias]; return n })
    try {
      const res = await fetch('/api/models/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerName, modelId }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setTestResults(prev => ({ ...prev, [alias]: { ok: true } }))
        setTimeout(() => setTestResults(prev => { const n = { ...prev }; delete n[alias]; return n }), 3000)
      } else {
        setTestResults(prev => ({ ...prev, [alias]: { ok: false, error: data.error || 'Unknown error' } }))
        setTimeout(() => setTestResults(prev => { const n = { ...prev }; delete n[alias]; return n }), 5000)
      }
    } catch (e: any) {
      setTestResults(prev => ({ ...prev, [alias]: { ok: false, error: e.message } }))
      setTimeout(() => setTestResults(prev => { const n = { ...prev }; delete n[alias]; return n }), 5000)
    }
    setTesting(null)
  }

  // Find this provider's definition to get available auth methods
  const providerDef = PROVIDERS.find(p => p.id === providerName)
  const hasSetupTokenMethod = providerDef?.authMethods.some(m => m.type === 'setupToken')
  const setupTokenMethod = providerDef?.authMethods.find(m => m.type === 'setupToken') as
    | { type: 'setupToken'; provider: string; command: string; tokenPrefix: string }
    | undefined

  /** Save a setup token for this provider */
  const handleSaveToken = async () => {
    if (!tokenValue.trim()) return
    setSaving(true)
    try {
      await fetch('/api/auth-profiles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerName, token: tokenValue.trim() }),
      })
      setTokenValue('')
      setShowTokenForm(false)
      onAuthChange()
    } catch {}
    setSaving(false)
  }

  /** Remove the setup token for this provider */
  const handleRemoveToken = async () => {
    if (!provider.setupTokenProfileId) return
    if (!confirm(t('settings.confirmRemoveToken'))) return
    await fetch('/api/auth-profiles', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: provider.setupTokenProfileId }),
    })
    onAuthChange()
  }

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      {/* Header: provider name + auth badge + delete */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm capitalize">{providerName}</span>
          <AuthModeBadge provider={provider} />
          {provider.baseUrl && <span className="text-xs text-muted-foreground">{provider.baseUrl}</span>}
        </div>
        <button onClick={onDelete} className="text-destructive hover:text-destructive/80 p-1">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Auth details row */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {provider.authMode === 'setup-token' && provider.setupTokenPreview && (
          <div className="flex items-center gap-2">
            <Shield className="w-3 h-3 text-blue-400" />
            <code>{provider.setupTokenPreview}</code>
            <button onClick={handleRemoveToken} className="text-muted-foreground hover:text-destructive" title="Remove token">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
        {provider.authMode === 'env-var' && (
          <span>Key: <code>${'{' + (provider.authDetail || '') + '}'}</code></span>
        )}
        {provider.authMode === 'config' && (
          <span>Key: <code>{provider.apiKey}</code></span>
        )}
        {provider.authMode === 'none' && hasSetupTokenMethod && (
          <button
            onClick={() => setShowTokenForm(true)}
            className="flex items-center gap-1 text-primary hover:text-primary/80"
          >
            <Shield className="w-3 h-3" /> {t('settings.addSetupToken')}
          </button>
        )}
        {/* Also show "add token" if currently using env var / config but setup token is available */}
        {provider.authMode !== 'none' && provider.authMode !== 'setup-token' && hasSetupTokenMethod && !provider.hasSetupToken && (
          <button
            onClick={() => setShowTokenForm(true)}
            className="flex items-center gap-1 text-primary/60 hover:text-primary/80 ml-2"
          >
            <Shield className="w-3 h-3" /> {t('settings.upgradeToSetupToken')}
          </button>
        )}
      </div>

      {/* Inline setup token form */}
      {showTokenForm && setupTokenMethod && (
        <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/30">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Setup Token</label>
            <input
              type="password"
              value={tokenValue}
              onChange={e => setTokenValue(e.target.value)}
              placeholder={setupTokenMethod.tokenPrefix + '...'}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Run <code className="bg-muted px-1 rounded">{setupTokenMethod.command}</code> to generate.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => { setShowTokenForm(false); setTokenValue('') }}
              className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted">
              Cancel
            </button>
            <button onClick={handleSaveToken} disabled={!tokenValue.trim() || saving}
              className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Models list */}
      <div className="space-y-1">
        {Object.entries(provider.models || {}).map(([alias, modelId]) => {
          const ref = `${providerName}/${alias}`
          const isDefault = ref === defaultModel
          return (
            <div key={alias} className={`flex items-center justify-between px-3 py-2 rounded-md ${isDefault ? 'bg-primary/10 border border-primary/30' : 'bg-muted/50'}`}>
              <div className="flex items-center gap-2">
                {isDefault && <Star className="w-3 h-3 text-primary fill-primary" />}
                <span className="text-sm font-medium">{alias}</span>
                <span className="text-xs text-muted-foreground">{modelId}</span>
              </div>
              <div className="flex items-center gap-1">
                {testing === alias ? (
                  <span className="p-1"><Loader2 className="w-3 h-3 animate-spin text-muted-foreground" /></span>
                ) : testResults[alias] ? (
                  testResults[alias].ok ? (
                    <span className="p-1" title={t('settings.testPassed')}><CheckCircle2 className="w-3 h-3 text-emerald-400" /></span>
                  ) : (
                    <span className="p-1" title={testResults[alias].error || t('settings.testFailed')}><AlertCircle className="w-3 h-3 text-destructive" /></span>
                  )
                ) : (
                  <button onClick={() => handleTestModel(alias, modelId)} title={t('settings.testModel')}
                    className="text-muted-foreground hover:text-primary p-1">
                    <Activity className="w-3 h-3" />
                  </button>
                )}
                {!isDefault && (
                  <button onClick={() => onSetDefault(ref)} title="Set as default"
                    className="text-muted-foreground hover:text-primary p-1">
                    <Star className="w-3 h-3" />
                  </button>
                )}
                <button onClick={() => onDeleteModel(alias)}
                  className="text-muted-foreground hover:text-destructive p-1">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Add model button */}
      <button onClick={onAddModel}
        className="flex items-center gap-1 text-xs text-primary hover:text-primary/80">
        <Plus className="w-3 h-3" /> {t('settings.addModel')}
      </button>
    </div>
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
    } catch {
      setUpdateResult({ ok: false, message: 'Failed to check for updates' })
    } finally {
      setChecking(false)
    }
  }, [])

  const doUpdate = async () => {
    setUpdating(true)
    setUpdateResult(null)
    try {
      const res = await fetch('/api/gateway/update', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setUpdateResult({
          ok: true,
          message: data.updated
            ? `${t('settings.updateSuccess')}: ${data.previousVersion} → ${data.currentVersion}${data.restarted ? '. Gateway ' + t('settings.restarted') : '. ' + t('settings.restartRequired')}`
            : t('settings.upToDate'),
        })
        if (data.updated) {
          setCurrent(data.currentVersion)
          setHasUpdate(false)
        }
      } else {
        setUpdateResult({ ok: false, message: data.error || t('settings.updateFailed') })
      }
    } catch (e: any) {
      setUpdateResult({ ok: false, message: e.message || t('settings.updateFailed') })
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
    } catch (e: any) {
      setUpdateResult({ ok: false, message: e.message || t('settings.updateFailed') })
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
type SettingsTab = 'general' | 'providers' | 'tools'

const WEB_SEARCH_PROVIDERS = [
  { id: 'brave', name: 'Brave Search', envKey: 'BRAVE_API_KEY', icon: '🔍' },
  { id: 'perplexity', name: 'Perplexity', envKey: 'PERPLEXITY_API_KEY', icon: '🟣' },
  { id: 'grok', name: 'Grok (xAI)', envKey: 'XAI_API_KEY', icon: '𝕏' },
  { id: 'gemini', name: 'Gemini', envKey: 'GEMINI_API_KEY', icon: '💎' },
  { id: 'kimi', name: 'Kimi / Moonshot', envKey: 'KIMI_API_KEY', icon: '🌙' },
]

const EMBEDDING_PROVIDERS = [
  { id: 'openai', name: 'OpenAI', envKey: 'OPENAI_API_KEY', icon: '🤖' },
  { id: 'gemini', name: 'Gemini', envKey: 'GEMINI_API_KEY', icon: '💎' },
  { id: 'voyage', name: 'Voyage AI', envKey: 'VOYAGE_API_KEY', icon: '🚀' },
  { id: 'mistral', name: 'Mistral', envKey: 'MISTRAL_API_KEY', icon: '🌬️' },
]

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
  const [envVars, setEnvVars] = useState<Record<string, string>>({})
  const [searchProvider, setSearchProvider] = useState('')
  const [searchApiKey, setSearchApiKey] = useState('')
  const [firecrawlApiKey, setFirecrawlApiKey] = useState('')
  const [embeddingProvider, setEmbeddingProvider] = useState('')
  const [embeddingApiKey, setEmbeddingApiKey] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const [saveResult, setSaveResult] = useState<{ section: string; ok: boolean; message: string } | null>(null)

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

  const fetchEnv = useCallback(async () => {
    try {
      const res = await fetch('/api/env')
      const data = await res.json()
      setEnvVars(data.vars || {})
    } catch {}
  }, [])

  const fetchTools = useCallback(async () => {
    try {
      const res = await fetch('/api/tools')
      const data = await res.json()
      setToolsConfig(data.tools || {})
    } catch {}
  }, [])

  const fetchMemoryConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/memory-config')
      if (res.ok) { const data = await res.json(); setMemoryConfig(data) }
    } catch {}
  }, [])

  useEffect(() => { fetchEnv(); fetchTools(); fetchMemoryConfig() }, [fetchEnv, fetchTools, fetchMemoryConfig])

  // Auto-select first configured provider
  useEffect(() => {
    if (!searchProvider) {
      const found = WEB_SEARCH_PROVIDERS.find(p => envVars[p.envKey])
      if (found) setSearchProvider(found.id)
    }
    if (!embeddingProvider) {
      const found = EMBEDDING_PROVIDERS.find(p => envVars[p.envKey])
      if (found) setEmbeddingProvider(found.id)
    }
  }, [envVars, searchProvider, embeddingProvider])

  const handleSave = async (section: string, envKey: string, value: string) => {
    if (!value.trim()) return
    setSaving(section)
    setSaveResult(null)
    try {
      const res = await fetch('/api/env', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: [{ key: envKey, value: value.trim() }] }),
      })
      const data = await res.json()
      if (data.ok) {
        setSaveResult({ section, ok: true, message: t('settings.keySaveSuccess') })
        if (section === 'search') setSearchApiKey('')
        if (section === 'fetch') setFirecrawlApiKey('')
        if (section === 'embedding') setEmbeddingApiKey('')
        await fetchEnv()
      } else {
        setSaveResult({ section, ok: false, message: data.error || t('settings.keySaveFailed') })
      }
    } catch {
      setSaveResult({ section, ok: false, message: t('settings.keySaveFailed') })
    } finally {
      setSaving(null)
    }
  }

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

  const selectedSearchProvider = WEB_SEARCH_PROVIDERS.find(p => p.id === searchProvider)
  const selectedEmbeddingProvider = EMBEDDING_PROVIDERS.find(p => p.id === embeddingProvider)

  // Derived tools state with defaults
  const agentToAgent = toolsConfig.agentToAgent || { enabled: true, allow: ['*'] }
  const sessions = toolsConfig.sessions || { visibility: 'self' }
  const exec = toolsConfig.exec || { security: 'full', timeoutSec: 120, applyPatch: { enabled: true } }
  const loopDetection = toolsConfig.loopDetection || { enabled: false, warningThreshold: 10, criticalThreshold: 20 }
  const fsConfig = toolsConfig.fs || { workspaceOnly: false }

  return (
    <div className="space-y-6">
      {/* Web Search */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="w-4 h-4" /> {t('settings.webSearch')}
          </CardTitle>
          <CardDescription>{t('settings.webSearchDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">{t('settings.toolProvider')}</label>
            <div className="flex flex-wrap gap-2">
              {WEB_SEARCH_PROVIDERS.map(p => {
                const isConfigured = !!envVars[p.envKey]
                const isSelected = searchProvider === p.id
                return (
                  <button
                    key={p.id}
                    onClick={() => setSearchProvider(p.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors ${
                      isSelected ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/30'
                    }`}
                  >
                    <span>{p.icon}</span>
                    <span>{p.name}</span>
                    {isConfigured && <Check className="w-3 h-3 text-emerald-400" />}
                  </button>
                )
              })}
            </div>
          </div>

          {selectedSearchProvider && (
            <div className="space-y-3 border border-border rounded-lg p-4 bg-muted/20">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{selectedSearchProvider.name}</span>
                {envVars[selectedSearchProvider.envKey] ? (
                  <Badge variant="success">{t('settings.configured')}</Badge>
                ) : (
                  <Badge variant="muted">{t('settings.notConfigured')}</Badge>
                )}
              </div>
              {envVars[selectedSearchProvider.envKey] && (
                <div className="text-xs text-muted-foreground font-mono bg-muted rounded px-2 py-1">
                  {selectedSearchProvider.envKey}={envVars[selectedSearchProvider.envKey]}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="password"
                  value={searchApiKey}
                  onChange={e => setSearchApiKey(e.target.value)}
                  placeholder={`${selectedSearchProvider.envKey}...`}
                  className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <button
                  onClick={() => handleSave('search', selectedSearchProvider.envKey, searchApiKey)}
                  disabled={!searchApiKey.trim() || saving === 'search'}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
                >
                  {saving === 'search' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {t('common.save')}
                </button>
              </div>
              {saveResult?.section === 'search' && (
                <div className={`text-xs px-3 py-2 rounded-lg ${saveResult.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                  {saveResult.message}
                  {saveResult.ok && <span className="ml-2 text-muted-foreground">{t('settings.keyHint')}</span>}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Web Fetch (Firecrawl) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="w-4 h-4" /> {t('settings.webFetch')}
              </CardTitle>
              <CardDescription>{t('settings.webFetchDesc')}</CardDescription>
            </div>
            {envVars['FIRECRAWL_API_KEY'] ? (
              <Badge variant="success">{t('settings.configured')}</Badge>
            ) : (
              <Badge variant="muted">{t('settings.notConfigured')}</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {envVars['FIRECRAWL_API_KEY'] && (
            <div className="text-xs text-muted-foreground font-mono bg-muted rounded px-2 py-1">
              FIRECRAWL_API_KEY={envVars['FIRECRAWL_API_KEY']}
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="password"
              value={firecrawlApiKey}
              onChange={e => setFirecrawlApiKey(e.target.value)}
              placeholder="FIRECRAWL_API_KEY..."
              className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <button
              onClick={() => handleSave('fetch', 'FIRECRAWL_API_KEY', firecrawlApiKey)}
              disabled={!firecrawlApiKey.trim() || saving === 'fetch'}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {saving === 'fetch' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {t('common.save')}
            </button>
          </div>
          {saveResult?.section === 'fetch' && (
            <div className={`text-xs px-3 py-2 rounded-lg ${saveResult.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              {saveResult.message}
              {saveResult.ok && <span className="ml-2 text-muted-foreground">{t('settings.keyHint')}</span>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Embedding / Memory */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Cpu className="w-4 h-4" /> {t('settings.embedding')}
          </CardTitle>
          <CardDescription>{t('settings.embeddingDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">{t('settings.toolProvider')}</label>
            <div className="flex flex-wrap gap-2">
              {EMBEDDING_PROVIDERS.map(p => {
                const isConfigured = !!envVars[p.envKey]
                const isSelected = embeddingProvider === p.id
                return (
                  <button
                    key={p.id}
                    onClick={() => setEmbeddingProvider(p.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors ${
                      isSelected ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/30'
                    }`}
                  >
                    <span>{p.icon}</span>
                    <span>{p.name}</span>
                    {isConfigured && <Check className="w-3 h-3 text-emerald-400" />}
                  </button>
                )
              })}
            </div>
          </div>

          {selectedEmbeddingProvider && (
            <div className="space-y-3 border border-border rounded-lg p-4 bg-muted/20">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{selectedEmbeddingProvider.name}</span>
                {envVars[selectedEmbeddingProvider.envKey] ? (
                  <Badge variant="success">{t('settings.configured')}</Badge>
                ) : (
                  <Badge variant="muted">{t('settings.notConfigured')}</Badge>
                )}
              </div>
              {envVars[selectedEmbeddingProvider.envKey] && (
                <div className="text-xs text-muted-foreground font-mono bg-muted rounded px-2 py-1">
                  {selectedEmbeddingProvider.envKey}={envVars[selectedEmbeddingProvider.envKey]}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="password"
                  value={embeddingApiKey}
                  onChange={e => setEmbeddingApiKey(e.target.value)}
                  placeholder={`${selectedEmbeddingProvider.envKey}...`}
                  className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <button
                  onClick={() => handleSave('embedding', selectedEmbeddingProvider.envKey, embeddingApiKey)}
                  disabled={!embeddingApiKey.trim() || saving === 'embedding'}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
                >
                  {saving === 'embedding' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {t('common.save')}
                </button>
              </div>
              {saveResult?.section === 'embedding' && (
                <div className={`text-xs px-3 py-2 rounded-lg ${saveResult.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                  {saveResult.message}
                  {saveResult.ok && <span className="ml-2 text-muted-foreground">{t('settings.keyHint')}</span>}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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
  const { mode, setMode, settings, updateSettings, modelsList, providers, defaultModel, fetchModels, setDefaultModel } = useAppStore()
  const { t, locale, setLocale } = useTranslation()
  const [showAddProvider, setShowAddProvider] = useState(false)
  const [addModelTo, setAddModelTo] = useState<string | null>(null)
  const [tab, setTab] = useState<SettingsTab>('general')

  useEffect(() => { fetchModels() }, [fetchModels])

  const settingsTabs: { key: SettingsTab; label: string; icon: typeof Settings }[] = [
    { key: 'general', label: t('settings.tabGeneral'), icon: Settings },
    { key: 'providers', label: t('settings.tabProviders'), icon: Cpu },
    { key: 'tools', label: t('settings.tabTools'), icon: Wrench },
  ]

  const handleAddProvider = async (p: { name: string; entries: { key: string; value: string }[]; baseUrl?: string }) => {
    // 1. Write env entries
    if (p.entries.length > 0) {
      await fetch('/api/env', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: p.entries }),
      })
    }

    // 2. Find the primary env key for this provider
    const providerDefMatch = PROVIDERS.find(pd => pd.id === p.name)
    const primaryEnvKey = p.entries[0]?.key || `${p.name.toUpperCase()}_API_KEY`

    // 3. Add provider to models.json (with baseUrl/api from provider definition)
    await fetch('/api/models', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'upsertProvider',
        provider: {
          name: p.name,
          apiKey: `\${${primaryEnvKey}}`,
          baseUrl: p.baseUrl || providerDefMatch?.baseUrl || undefined,
          api: providerDefMatch?.api || undefined,
          models: {},
        },
      }),
    })
    fetchModels()
  }

  const handleDeleteProvider = async (name: string) => {
    if (!confirm(`Delete provider "${name}" and all its models?`)) return
    await fetch('/api/models', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'deleteProvider', name }),
    })
    fetchModels()
  }

  const handleAddModel = async (alias: string, modelId: string) => {
    if (!addModelTo) return
    await fetch('/api/models', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'addModel', provider: addModelTo, alias, modelId }),
    })
    fetchModels()
  }

  const handleDeleteModel = async (provider: string, alias: string) => {
    await fetch('/api/models', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'deleteModel', provider, alias }),
    })
    fetchModels()
  }

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

      {/* Providers tab */}
      {tab === 'providers' && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2"><Cpu className="w-4 h-4" /> {t('settings.modelProviders')}</CardTitle>
                  <CardDescription>{t('settings.modelProvidersDesc')}</CardDescription>
                </div>
                <button onClick={() => setShowAddProvider(true)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90">
                  <Plus className="w-3 h-3" /> {t('settings.addProvider')}
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(providers).map(([providerName, provider]) => (
                <ProviderCard
                  key={providerName}
                  providerName={providerName}
                  provider={provider}
                  defaultModel={defaultModel}
                  onDelete={() => handleDeleteProvider(providerName)}
                  onDeleteModel={(alias) => handleDeleteModel(providerName, alias)}
                  onSetDefault={(ref) => setDefaultModel(ref)}
                  onAddModel={() => setAddModelTo(providerName)}
                  onAuthChange={() => fetchModels()}
                />
              ))}
              {Object.keys(providers).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">{t('settings.noProviders')}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Key className="w-4 h-4" /> {t('settings.allModels')}</CardTitle>
              <CardDescription>{t('settings.allModelsDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {modelsList.map(m => (
                  <div key={m.ref} className={`flex items-center justify-between px-3 py-2 rounded-md ${m.isDefault ? 'bg-primary/10' : 'hover:bg-muted/50'}`}>
                    <div className="flex items-center gap-2">
                      {m.isDefault && <Check className="w-3 h-3 text-primary" />}
                      <code className="text-sm">{m.ref}</code>
                      <span className="text-xs text-muted-foreground">→ {m.modelId}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {m.hasApiKey ? <Badge variant="success">Ready</Badge> : <Badge variant="muted">No Key</Badge>}
                      {m.isDefault && <Badge variant="default">Default</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Tools tab */}
      {tab === 'tools' && <OpenClawToolsTab />}

      {showAddProvider && <AddProviderDialog onAdd={handleAddProvider} onClose={() => setShowAddProvider(false)} />}
      {addModelTo && <AddModelDialog provider={addModelTo} onAdd={handleAddModel} onClose={() => setAddModelTo(null)} />}
    </div>
  )
}
