'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from '@/lib/i18n'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import PluginConfigForm from '@/components/plugin-config-form'
import ProviderAuthPanel, { hasProviderDef } from '@/components/provider-auth-panel'
import type { ProviderAuthData } from '@/components/provider-auth-panel'
import { PROVIDERS } from '@/lib/providers'
import {
  Puzzle, Brain, Search, Globe, Mic, ImageIcon, Cpu, Network, MessageSquare, Wrench,
  ChevronDown, ChevronRight, Save, Loader2, Settings2, ChevronsUpDown, Info, Check, KeyRound, AlertTriangle, Eye, EyeOff,
  Plus, Trash2, Star, X, Shield,
} from 'lucide-react'

// --- Types ---

type UiHint = { label?: string; help?: string; sensitive?: boolean; placeholder?: string; advanced?: boolean }

type PluginInfo = {
  id: string; name: string; description: string; version: string
  kind: string | null; enabled: boolean; status: string; category: string
  configJsonSchema: Record<string, unknown> | null
  configUiHints: Record<string, UiHint> | null
  providerIds: string[]; channelIds: string[]
  webSearchProviderIds: string[]; speechProviderIds: string[]; imageGenerationProviderIds: string[]
  envVars: string[]
}

type CategoryInfo = { id: string; plugins: PluginInfo[] }

type PluginEntry = { enabled?: boolean; config?: Record<string, unknown> }

type PluginsConfig = {
  slots: Record<string, string | null>
  entries: Record<string, PluginEntry>
}

type ProviderModels = {
  models: Record<string, string>  // alias → modelId
  hasApiKey: boolean
  baseUrl?: string
  authMode?: 'setup-token' | 'oauth' | 'env-var' | 'config' | 'none'
  authDetail?: string
  hasSetupToken?: boolean
  setupTokenPreview?: string | null
  setupTokenProfileId?: string | null
}

// --- Category metadata ---

const CATEGORY_META: Record<string, { icon: React.ElementType }> = {
  memory: { icon: Brain },
  search: { icon: Search },
  web: { icon: Globe },
  voice: { icon: Mic },
  image: { icon: ImageIcon },
  providers: { icon: Cpu },
  gateway: { icon: Network },
  channels: { icon: MessageSquare },
  tools: { icon: Wrench },
}

// --- Component ---

export default function PluginsTab() {
  const { t } = useTranslation()

  const [categories, setCategories] = useState<CategoryInfo[]>([])
  const [pluginConfig, setPluginConfig] = useState<PluginsConfig>({ slots: {}, entries: {} })
  const [envStatus, setEnvStatus] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(['memory', 'search']))
  const [expandedPlugins, setExpandedPlugins] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const [saveResult, setSaveResult] = useState<{ id: string; ok: boolean; message: string } | null>(null)
  // Local edits for plugin configs (before save)
  const [editedConfigs, setEditedConfigs] = useState<Record<string, Record<string, unknown>>>({})
  // Track whether any plugin was toggled/changed (needs Gateway restart)
  const [dirty, setDirty] = useState(false)
  // Env key editing: pluginId → { envVarName → value }
  const [editingEnvKeys, setEditingEnvKeys] = useState<Record<string, Record<string, string>>>({})
  // Which env key inputs are visible (password toggle)
  const [visibleEnvKeys, setVisibleEnvKeys] = useState<Set<string>>(new Set())
  // Models data from /api/models
  const [modelsProviders, setModelsProviders] = useState<Record<string, ProviderModels>>({})
  const [defaultModel, setDefaultModelState] = useState('')
  // Add model form: pluginId → { alias, modelId }
  const [addingModel, setAddingModel] = useState<Record<string, { alias: string; modelId: string }>>({})
  // Which provider auth panels are open
  const [editingAuth, setEditingAuth] = useState<Set<string>>(new Set())
  // Base URL edits per provider
  const [baseUrlEdits, setBaseUrlEdits] = useState<Record<string, string>>({})
  const [baseUrlSaving, setBaseUrlSaving] = useState<string | null>(null)

  const fetchPlugins = useCallback(async () => {
    try {
      const res = await fetch('/api/plugins')
      const data = await res.json()
      setCategories(data.categories || [])
      setPluginConfig(data.config || { slots: {}, entries: {} })
      setEnvStatus(data.envStatus || {})
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch('/api/models')
      const data = await res.json()
      setModelsProviders(data.providers || {})
      setDefaultModelState(data.default || '')
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchPlugins(); fetchModels() }, [fetchPlugins, fetchModels])

  // --- Helpers ---

  /** Check if a plugin has relevant env vars configured */
  function getPluginEnvStatus(plugin: PluginInfo): { configured: string[]; missing: string[] } {
    const configured: string[] = []
    const missing: string[] = []
    for (const v of plugin.envVars || []) {
      if (envStatus[v]) configured.push(v)
      else missing.push(v)
    }
    return { configured, missing }
  }

  function isPluginEnabled(pluginId: string): boolean {
    const entry = pluginConfig.entries[pluginId]
    return entry?.enabled ?? false
  }

  function getPluginConfigValues(pluginId: string): Record<string, unknown> {
    if (editedConfigs[pluginId]) return editedConfigs[pluginId]
    return (pluginConfig.entries[pluginId]?.config as Record<string, unknown>) || {}
  }

  // --- Actions ---

  async function togglePlugin(pluginId: string, enabled: boolean) {
    setSaving(pluginId)
    setSaveResult(null)
    try {
      const res = await fetch('/api/plugins', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle', pluginId, enabled }),
      })
      const data = await res.json()
      setSaveResult({ id: pluginId, ok: data.ok, message: data.ok ? t('settings.pluginSaved') : (data.error || t('settings.pluginSaveFailed')) })
      if (data.ok) { setDirty(true); await fetchPlugins() }
    } catch {
      setSaveResult({ id: pluginId, ok: false, message: t('settings.pluginSaveFailed') })
    } finally { setSaving(null) }
  }

  async function savePluginConfig(pluginId: string) {
    const config = editedConfigs[pluginId]
    if (!config) return
    setSaving(pluginId)
    setSaveResult(null)
    try {
      const res = await fetch('/api/plugins', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'config', pluginId, config }),
      })
      const data = await res.json()
      setSaveResult({ id: pluginId, ok: data.ok, message: data.ok ? t('settings.pluginSaved') : (data.error || t('settings.pluginSaveFailed')) })
      if (data.ok) {
        setEditedConfigs(prev => { const n = { ...prev }; delete n[pluginId]; return n })
        setDirty(true)
        await fetchPlugins()
      }
    } catch {
      setSaveResult({ id: pluginId, ok: false, message: t('settings.pluginSaveFailed') })
    } finally { setSaving(null) }
  }

  async function setMemorySlot(pluginId: string | null) {
    setSaving('memory-slot')
    setSaveResult(null)
    try {
      const res = await fetch('/api/plugins', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'slot', slotKey: 'memory', pluginId }),
      })
      const data = await res.json()
      setSaveResult({ id: 'memory-slot', ok: data.ok, message: data.ok ? t('settings.pluginSaved') : (data.error || t('settings.pluginSaveFailed')) })
      if (data.ok) { setDirty(true); await fetchPlugins() }
    } catch {
      setSaveResult({ id: 'memory-slot', ok: false, message: t('settings.pluginSaveFailed') })
    } finally { setSaving(null) }
  }

  async function saveEnvKeys(pluginId: string) {
    const keys = editingEnvKeys[pluginId]
    if (!keys) return
    const entries = Object.entries(keys).filter(([, v]) => v.trim()).map(([key, value]) => ({ key, value: value.trim() }))
    if (entries.length === 0) return
    setSaving(pluginId + '-env')
    setSaveResult(null)
    try {
      const res = await fetch('/api/env', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      })
      const data = await res.json()
      if (data.ok) {
        setSaveResult({ id: pluginId, ok: true, message: t('settings.keySaveSuccess') })
        setEditingEnvKeys(prev => { const n = { ...prev }; delete n[pluginId]; return n })
        setDirty(true)
        await fetchPlugins()
      } else {
        setSaveResult({ id: pluginId, ok: false, message: data.error || t('settings.keySaveFailed') })
      }
    } catch {
      setSaveResult({ id: pluginId, ok: false, message: t('settings.keySaveFailed') })
    } finally { setSaving(null) }
  }

  async function addModel(provider: string) {
    const form = addingModel[provider]
    if (!form?.alias?.trim() || !form?.modelId?.trim()) return
    setSaving(provider + '-model')
    try {
      await fetch('/api/models', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addModel', provider, alias: form.alias.trim(), modelId: form.modelId.trim() }),
      })
      setAddingModel(prev => { const n = { ...prev }; delete n[provider]; return n })
      setDirty(true)
      await fetchModels()
    } catch { /* ignore */ }
    finally { setSaving(null) }
  }

  async function deleteModel(provider: string, alias: string) {
    setSaving(provider + '-model')
    try {
      await fetch('/api/models', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteModel', provider, alias }),
      })
      setDirty(true)
      await fetchModels()
    } catch { /* ignore */ }
    finally { setSaving(null) }
  }

  async function saveBaseUrl(provider: string) {
    const baseUrl = baseUrlEdits[provider]?.trim() || ''
    setBaseUrlSaving(provider)
    try {
      await fetch('/api/models', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setBaseUrl', provider, baseUrl: baseUrl || null }),
      })
      setBaseUrlEdits(prev => { const n = { ...prev }; delete n[provider]; return n })
      setDirty(true)
      await fetchModels()
    } catch { /* ignore */ }
    finally { setBaseUrlSaving(null) }
  }

  async function setDefaultModel(ref: string) {
    setSaving('default-model')
    try {
      await fetch('/api/models', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setDefault', ref }),
      })
      setDirty(true)
      await fetchModels()
    } catch { /* ignore */ }
    finally { setSaving(null) }
  }

  function toggleEnvKeyEdit(pluginId: string, envVars: string[]) {
    setEditingEnvKeys(prev => {
      if (prev[pluginId]) {
        const n = { ...prev }; delete n[pluginId]; return n
      }
      const init: Record<string, string> = {}
      for (const v of envVars) init[v] = ''
      return { ...prev, [pluginId]: init }
    })
  }

  function toggleAuthEdit(pluginId: string) {
    setEditingAuth(prev => {
      const n = new Set(prev)
      n.has(pluginId) ? n.delete(pluginId) : n.add(pluginId)
      return n
    })
  }

  function getProviderAuthData(pluginId: string): ProviderAuthData | null {
    const pm = modelsProviders[pluginId]
    if (!pm || !pm.authMode) return null
    return {
      authMode: pm.authMode,
      authDetail: pm.authDetail,
      hasSetupToken: pm.hasSetupToken ?? false,
      setupTokenPreview: pm.setupTokenPreview ?? null,
      setupTokenProfileId: pm.setupTokenProfileId ?? null,
    }
  }

  async function handleAuthSaved(pluginId: string) {
    setDirty(true)
    await Promise.all([fetchPlugins(), fetchModels()])
    setEditingAuth(prev => { const n = new Set(prev); n.delete(pluginId); return n })
  }

  // --- Toggle expand ---

  function toggleCat(catId: string) {
    setExpandedCats(prev => {
      const n = new Set(prev)
      n.has(catId) ? n.delete(catId) : n.add(catId)
      return n
    })
  }

  function togglePluginExpand(pluginId: string) {
    setExpandedPlugins(prev => {
      const n = new Set(prev)
      n.has(pluginId) ? n.delete(pluginId) : n.add(pluginId)
      return n
    })
  }

  function expandAll() {
    setExpandedCats(new Set(categories.map(c => c.id)))
  }

  function collapseAll() {
    setExpandedCats(new Set())
    setExpandedPlugins(new Set())
  }

  // --- Filter ---

  function filterPlugins(plugins: PluginInfo[]): PluginInfo[] {
    if (!searchQuery.trim()) return plugins
    const q = searchQuery.toLowerCase()
    return plugins.filter(p =>
      p.id.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q)
    )
  }

  // --- Render ---

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const memorySlotValue = pluginConfig.slots.memory || 'memory-core'

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Puzzle className="w-4 h-4" /> {t('settings.tabPlugins')}
          </CardTitle>
          <CardDescription>{t('settings.pluginsDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Search + expand/collapse */}
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('settings.pluginSearch')}
              className="flex-1 px-3 py-1.5 text-sm bg-muted border border-border rounded-md focus:ring-2 focus:ring-primary/50 focus:outline-none"
            />
            <button
              onClick={expandAll}
              className="px-3 py-1.5 text-xs border border-border rounded-md hover:bg-muted transition-colors"
            >
              {t('settings.expandAll')}
            </button>
            <button
              onClick={collapseAll}
              className="px-3 py-1.5 text-xs border border-border rounded-md hover:bg-muted transition-colors"
            >
              {t('settings.collapseAll')}
            </button>
          </div>

          {/* Restart hint — only shown after changes */}
          {dirty && (
            <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 px-3 py-2 rounded-lg">
              <Info className="w-3.5 h-3.5 shrink-0" />
              {t('settings.pluginRestartHint')}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Category sections */}
      {categories.map(cat => {
        const filtered = filterPlugins(cat.plugins)
        if (filtered.length === 0) return null
        const isExpanded = expandedCats.has(cat.id)
        const meta = CATEGORY_META[cat.id] || { icon: Wrench }
        const Icon = meta.icon
        const enabledCount = filtered.filter(p => isPluginEnabled(p.id) || (cat.id === 'memory' && memorySlotValue === p.id)).length

        return (
          <Card key={cat.id}>
            {/* Category header */}
            <button
              onClick={() => toggleCat(cat.id)}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                <Icon className="w-4 h-4" />
                <span className="text-sm font-medium">{t(`settings.pluginCat${cat.id.charAt(0).toUpperCase()}${cat.id.slice(1)}`)}</span>
              </div>
              <Badge variant="muted" className="text-xs">
                {enabledCount}/{filtered.length}
              </Badge>
            </button>

            {/* Category content */}
            {isExpanded && (
              <CardContent className="pt-0 space-y-2">
                {cat.id === 'memory' ? (
                  /* Memory slot: radio group */
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">{t('settings.pluginMemorySlotDesc')}</p>
                    {/* None option */}
                    <label className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border hover:bg-muted/30 cursor-pointer">
                      <input
                        type="radio"
                        name="memory-slot"
                        checked={!memorySlotValue || memorySlotValue === 'none'}
                        onChange={() => setMemorySlot(null)}
                        className="accent-primary"
                      />
                      <span className="text-sm text-muted-foreground">{t('settings.pluginMemoryNone')}</span>
                    </label>
                    {filtered.map(plugin => (
                      <div key={plugin.id} className="border border-border rounded-lg">
                        <label className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/30">
                          <input
                            type="radio"
                            name="memory-slot"
                            checked={memorySlotValue === plugin.id}
                            onChange={() => setMemorySlot(plugin.id)}
                            className="accent-primary"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{plugin.id}</span>
                              {plugin.version && <span className="text-xs text-muted-foreground">{plugin.version}</span>}
                              {(() => {
                                const es = getPluginEnvStatus(plugin)
                                if (es.configured.length > 0 && es.missing.length === 0) return (
                                  <button
                                    onClick={e => { e.preventDefault(); toggleEnvKeyEdit(plugin.id, plugin.envVars) }}
                                    className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300"
                                    title={es.configured.join(', ') + ' — ' + t('settings.changeKey')}
                                  >
                                    <KeyRound className="w-3 h-3" /><Check className="w-3 h-3" />
                                  </button>
                                )
                                if (es.missing.length > 0) return (
                                  <button
                                    onClick={e => { e.preventDefault(); toggleEnvKeyEdit(plugin.id, plugin.envVars) }}
                                    className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300"
                                    title={es.missing.join(', ')}
                                  >
                                    <AlertTriangle className="w-3 h-3" />
                                    {t('settings.pluginConfigureKey')}
                                  </button>
                                )
                                return null
                              })()}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{plugin.description}</p>
                          </div>
                          {plugin.configJsonSchema && (
                            <button
                              onClick={e => { e.preventDefault(); togglePluginExpand(plugin.id) }}
                              className="p-1 rounded hover:bg-muted transition-colors"
                            >
                              <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
                            </button>
                          )}
                        </label>
                        {/* Env key input panel (memory) */}
                        {editingEnvKeys[plugin.id] && (
                          <div className="px-4 pb-3 pt-2 border-t border-border/50 space-y-2">
                            {Object.entries(editingEnvKeys[plugin.id]).map(([envKey, val]) => (
                              <div key={envKey} className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">{envKey}</label>
                                <div className="flex gap-2">
                                  <input
                                    type={visibleEnvKeys.has(envKey) ? 'text' : 'password'}
                                    value={val}
                                    onChange={e => setEditingEnvKeys(prev => ({
                                      ...prev, [plugin.id]: { ...prev[plugin.id], [envKey]: e.target.value }
                                    }))}
                                    placeholder={`${envKey}...`}
                                    className="flex-1 px-2.5 py-1.5 text-xs font-mono bg-muted border border-border rounded-md focus:ring-2 focus:ring-primary/50 focus:outline-none"
                                  />
                                  <button
                                    onClick={() => setVisibleEnvKeys(prev => {
                                      const n = new Set(prev); n.has(envKey) ? n.delete(envKey) : n.add(envKey); return n
                                    })}
                                    className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground"
                                  >
                                    {visibleEnvKeys.has(envKey) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                              </div>
                            ))}
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                onClick={() => saveEnvKeys(plugin.id)}
                                disabled={saving === plugin.id + '-env' || !Object.values(editingEnvKeys[plugin.id] || {}).some(v => v.trim())}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
                              >
                                {saving === plugin.id + '-env' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                {t('common.save')}
                              </button>
                              <button
                                onClick={() => setEditingEnvKeys(prev => { const n = { ...prev }; delete n[plugin.id]; return n })}
                                className="px-3 py-1.5 text-xs border border-border rounded-md hover:bg-muted transition-colors"
                              >
                                {t('common.cancel')}
                              </button>
                              {saveResult?.id === plugin.id && (
                                <span className={`text-xs ${saveResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>{saveResult.message}</span>
                              )}
                            </div>
                          </div>
                        )}
                        {/* Plugin config panel */}
                        {expandedPlugins.has(plugin.id) && plugin.configJsonSchema && (
                          <div className="px-4 pb-3 pt-1 border-t border-border/50 space-y-3">
                            <PluginConfigForm
                              schema={plugin.configJsonSchema as Record<string, unknown>}
                              uiHints={plugin.configUiHints}
                              values={getPluginConfigValues(plugin.id)}
                              onChange={vals => setEditedConfigs(prev => ({ ...prev, [plugin.id]: vals }))}
                            />
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => savePluginConfig(plugin.id)}
                                disabled={saving === plugin.id || !editedConfigs[plugin.id]}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
                              >
                                {saving === plugin.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                {t('common.save')}
                              </button>
                              {saveResult?.id === plugin.id && (
                                <span className={`text-xs ${saveResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>{saveResult.message}</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    {saving === 'memory-slot' && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                    {saveResult?.id === 'memory-slot' && (
                      <span className={`text-xs ${saveResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>{saveResult.message}</span>
                    )}
                  </div>
                ) : (
                  /* Normal category: toggle + config */
                  <div className="space-y-1">
                    {filtered.map(plugin => {
                      const enabled = isPluginEnabled(plugin.id)
                      const isOpen = expandedPlugins.has(plugin.id)

                      return (
                        <div key={plugin.id} className="border border-border rounded-lg">
                          {/* Plugin row */}
                          <div className="flex items-center gap-3 px-3 py-2">
                            {/* Toggle */}
                            <button
                              onClick={() => togglePlugin(plugin.id, !enabled)}
                              disabled={saving === plugin.id}
                              className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${enabled ? 'bg-primary' : 'bg-muted'}`}
                            >
                              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${enabled ? 'translate-x-4' : ''}`} />
                            </button>
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{plugin.id}</span>
                                {plugin.version && <span className="text-xs text-muted-foreground">{plugin.version}</span>}
                                {saving === plugin.id && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                                {(() => {
                                  const isProvider = hasProviderDef(plugin.id)
                                  if (isProvider) {
                                    const pm = modelsProviders[plugin.id]
                                    const mode = pm?.authMode || 'none'
                                    if (mode === 'setup-token') return (
                                      <button
                                        onClick={() => toggleAuthEdit(plugin.id)}
                                        className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300"
                                        title={`Setup Token — ${pm?.setupTokenPreview || ''}`}
                                      >
                                        <Shield className="w-3 h-3" /><Check className="w-3 h-3" />
                                      </button>
                                    )
                                    if (mode === 'env-var' || mode === 'config' || mode === 'oauth') return (
                                      <button
                                        onClick={() => toggleAuthEdit(plugin.id)}
                                        className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300"
                                        title={pm?.authDetail || t('settings.authConfigured')}
                                      >
                                        <KeyRound className="w-3 h-3" /><Check className="w-3 h-3" />
                                      </button>
                                    )
                                    return (
                                      <button
                                        onClick={() => toggleAuthEdit(plugin.id)}
                                        className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300"
                                      >
                                        <AlertTriangle className="w-3 h-3" />
                                        {t('settings.pluginConfigureKey')}
                                      </button>
                                    )
                                  }
                                  // Fallback: generic env-key badge for non-provider plugins
                                  const es = getPluginEnvStatus(plugin)
                                  if (es.configured.length > 0 && es.missing.length === 0) return (
                                    <button
                                      onClick={() => toggleEnvKeyEdit(plugin.id, plugin.envVars)}
                                      className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300"
                                      title={es.configured.join(', ') + ' — ' + t('settings.changeKey')}
                                    >
                                      <KeyRound className="w-3 h-3" /><Check className="w-3 h-3" />
                                    </button>
                                  )
                                  if (es.missing.length > 0) return (
                                    <button
                                      onClick={() => toggleEnvKeyEdit(plugin.id, plugin.envVars)}
                                      className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300"
                                      title={es.missing.join(', ')}
                                    >
                                      <AlertTriangle className="w-3 h-3" />
                                      {t('settings.pluginConfigureKey')}
                                    </button>
                                  )
                                  return null
                                })()}
                              </div>
                              <p className="text-xs text-muted-foreground truncate">{plugin.description}</p>
                            </div>
                            {/* Config expand button */}
                            {plugin.configJsonSchema && (
                              <button
                                onClick={() => togglePluginExpand(plugin.id)}
                                className="p-1.5 rounded hover:bg-muted transition-colors"
                              >
                                {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />}
                              </button>
                            )}
                            {/* Save result badge */}
                            {saveResult?.id === plugin.id && (
                              <span className={`text-xs shrink-0 ${saveResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>{saveResult.message}</span>
                            )}
                          </div>

                          {/* Provider auth panel (for plugins matching a known provider) */}
                          {hasProviderDef(plugin.id) && editingAuth.has(plugin.id) && (
                            <ProviderAuthPanel
                              pluginId={plugin.id}
                              providerData={getProviderAuthData(plugin.id)}
                              onSaved={() => handleAuthSaved(plugin.id)}
                              onCancel={() => toggleAuthEdit(plugin.id)}
                            />
                          )}

                          {/* Generic env key input panel (for non-provider plugins) */}
                          {!hasProviderDef(plugin.id) && editingEnvKeys[plugin.id] && (
                            <div className="px-4 pb-3 pt-2 border-t border-border/50 space-y-2">
                              {Object.entries(editingEnvKeys[plugin.id]).map(([envKey, val]) => (
                                <div key={envKey} className="space-y-1">
                                  <label className="text-xs font-medium text-muted-foreground">{envKey}</label>
                                  <div className="flex gap-2">
                                    <input
                                      type={visibleEnvKeys.has(envKey) ? 'text' : 'password'}
                                      value={val}
                                      onChange={e => setEditingEnvKeys(prev => ({
                                        ...prev, [plugin.id]: { ...prev[plugin.id], [envKey]: e.target.value }
                                      }))}
                                      placeholder={`${envKey}...`}
                                      className="flex-1 px-2.5 py-1.5 text-xs font-mono bg-muted border border-border rounded-md focus:ring-2 focus:ring-primary/50 focus:outline-none"
                                    />
                                    <button
                                      onClick={() => setVisibleEnvKeys(prev => {
                                        const n = new Set(prev); n.has(envKey) ? n.delete(envKey) : n.add(envKey); return n
                                      })}
                                      className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground"
                                    >
                                      {visibleEnvKeys.has(envKey) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                    </button>
                                  </div>
                                </div>
                              ))}
                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  onClick={() => saveEnvKeys(plugin.id)}
                                  disabled={saving === plugin.id + '-env' || !Object.values(editingEnvKeys[plugin.id] || {}).some(v => v.trim())}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
                                >
                                  {saving === plugin.id + '-env' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                  {t('common.save')}
                                </button>
                                <button
                                  onClick={() => setEditingEnvKeys(prev => { const n = { ...prev }; delete n[plugin.id]; return n })}
                                  className="px-3 py-1.5 text-xs border border-border rounded-md hover:bg-muted transition-colors"
                                >
                                  {t('common.cancel')}
                                </button>
                                {saveResult?.id === plugin.id && (
                                  <span className={`text-xs ${saveResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>{saveResult.message}</span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Config panel */}
                          {isOpen && plugin.configJsonSchema && (
                            <div className="px-4 pb-3 pt-1 border-t border-border/50 space-y-3">
                              <PluginConfigForm
                                schema={plugin.configJsonSchema as Record<string, unknown>}
                                uiHints={plugin.configUiHints}
                                values={getPluginConfigValues(plugin.id)}
                                onChange={vals => setEditedConfigs(prev => ({ ...prev, [plugin.id]: vals }))}
                              />
                              <button
                                onClick={() => savePluginConfig(plugin.id)}
                                disabled={saving === plugin.id || !editedConfigs[plugin.id]}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
                              >
                                {saving === plugin.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                {t('common.save')}
                              </button>
                            </div>
                          )}

                          {/* Models section — only for provider/gateway plugins with models configured */}
                          {(cat.id === 'providers' || cat.id === 'gateway') && (() => {
                            const pm = modelsProviders[plugin.id]
                            const models = pm?.models || {}
                            const modelEntries = Object.entries(models)
                            const isAdding = !!addingModel[plugin.id]
                            return (
                              <div className="px-4 pb-3 pt-2 border-t border-border/50 space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-medium text-muted-foreground">{t('settings.pluginModels')}</span>
                                  <button
                                    onClick={() => setAddingModel(prev => prev[plugin.id]
                                      ? (() => { const n = { ...prev }; delete n[plugin.id]; return n })()
                                      : { ...prev, [plugin.id]: { alias: '', modelId: '' } }
                                    )}
                                    className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                                  >
                                    {isAdding ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                                    {isAdding ? t('common.cancel') : t('settings.pluginAddModel')}
                                  </button>
                                </div>
                                {/* Base URL */}
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] text-muted-foreground shrink-0 w-16">{t('settings.baseUrl')}</span>
                                  <input
                                    type="text"
                                    value={baseUrlEdits[plugin.id] ?? pm?.baseUrl ?? ''}
                                    onChange={e => setBaseUrlEdits(prev => ({ ...prev, [plugin.id]: e.target.value }))}
                                    placeholder={PROVIDERS.find(p => p.id === plugin.id)?.baseUrl || t('settings.providerBaseUrlPlaceholder')}
                                    className="flex-1 px-2 py-1 text-xs font-mono bg-muted border border-border rounded-md focus:ring-2 focus:ring-primary/50 focus:outline-none"
                                  />
                                  {baseUrlEdits[plugin.id] !== undefined && (
                                    <button
                                      onClick={() => saveBaseUrl(plugin.id)}
                                      disabled={baseUrlSaving === plugin.id}
                                      className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 shrink-0"
                                    >
                                      {baseUrlSaving === plugin.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                    </button>
                                  )}
                                </div>
                                {modelEntries.map(([alias, modelId]) => {
                                  const ref = `${plugin.id}/${alias}`
                                  const isDefault = ref === defaultModel
                                  return (
                                    <div key={alias} className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs ${isDefault ? 'bg-primary/10' : 'bg-muted/50'}`}>
                                      <div className="flex items-center gap-2 min-w-0">
                                        {isDefault && <Star className="w-3 h-3 text-primary fill-primary shrink-0" />}
                                        <span className="font-medium">{alias}</span>
                                        <span className="text-muted-foreground truncate">{modelId}</span>
                                      </div>
                                      <div className="flex items-center gap-0.5 shrink-0">
                                        {!isDefault && (
                                          <button onClick={() => setDefaultModel(ref)} title={t('settings.pluginSetDefault')} className="p-1 text-muted-foreground hover:text-primary">
                                            <Star className="w-3 h-3" />
                                          </button>
                                        )}
                                        <button onClick={() => deleteModel(plugin.id, alias)} className="p-1 text-muted-foreground hover:text-destructive">
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>
                                  )
                                })}
                                {/* Add model form */}
                                {isAdding && (() => {
                                  const provDef = PROVIDERS.find(p => p.id === plugin.id)
                                  const catalog = provDef?.catalogModels || []
                                  // Filter out models already added
                                  const existingAliases = new Set(Object.keys(models))
                                  const available = catalog.filter(m => !existingAliases.has(m.alias))
                                  const form = addingModel[plugin.id]
                                  const isCustom = form?.alias === '__custom__'

                                  return (
                                    <div className="space-y-2 pt-1">
                                      {/* Catalog model selector */}
                                      {available.length > 0 && !isCustom && (
                                        <div className="space-y-1.5">
                                          <p className="text-[11px] text-muted-foreground">{t('settings.pluginClickToAdd')}</p>
                                          <div className="grid grid-cols-1 gap-1">
                                            {available.map(cm => (
                                              <button
                                                key={cm.id}
                                                onClick={async () => {
                                                  setSaving(plugin.id + '-model')
                                                  try {
                                                    await fetch('/api/models', {
                                                      method: 'PUT',
                                                      headers: { 'Content-Type': 'application/json' },
                                                      body: JSON.stringify({ action: 'addModel', provider: plugin.id, alias: cm.alias, modelId: cm.id, baseUrl: provDef?.baseUrl, api: provDef?.api }),
                                                    })
                                                    setDirty(true)
                                                    await fetchModels()
                                                  } catch { /* ignore */ }
                                                  finally { setSaving(null) }
                                                }}
                                                disabled={saving === plugin.id + '-model'}
                                                className="group flex items-center justify-between px-2.5 py-2 text-xs rounded-md border border-dashed border-border/60 hover:border-primary/50 hover:bg-primary/5 transition-colors text-left"
                                              >
                                                <div className="flex items-center gap-2 min-w-0">
                                                  <Plus className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                                                  <span className="font-medium">{cm.name}</span>
                                                  <span className="text-muted-foreground text-[11px]">{cm.alias}</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground shrink-0">
                                                  {cm.reasoning && <span className="px-1 py-0.5 rounded bg-blue-500/10 text-blue-400">reasoning</span>}
                                                  {cm.contextWindow && <span>{Math.round(cm.contextWindow / 1000)}k ctx</span>}
                                                </div>
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      {/* Custom model input (shown when no catalog or user clicks custom) */}
                                      {(available.length === 0 || isCustom) && (
                                        <div className="flex gap-2 items-end">
                                          <div className="flex-1">
                                            <input
                                              type="text"
                                              value={isCustom ? '' : (form?.alias || '')}
                                              onChange={e => setAddingModel(prev => ({ ...prev, [plugin.id]: { alias: e.target.value, modelId: prev[plugin.id]?.modelId || '' } }))}
                                              placeholder={t('settings.pluginModelAlias')}
                                              className="w-full px-2.5 py-1.5 text-xs bg-muted border border-border rounded-md focus:ring-2 focus:ring-primary/50 focus:outline-none"
                                            />
                                          </div>
                                          <div className="flex-[2]">
                                            <input
                                              type="text"
                                              value={form?.modelId || ''}
                                              onChange={e => setAddingModel(prev => ({ ...prev, [plugin.id]: { alias: prev[plugin.id]?.alias || '', modelId: e.target.value } }))}
                                              placeholder={t('settings.pluginModelId')}
                                              className="w-full px-2.5 py-1.5 text-xs bg-muted border border-border rounded-md focus:ring-2 focus:ring-primary/50 focus:outline-none"
                                            />
                                          </div>
                                          <button
                                            onClick={() => addModel(plugin.id)}
                                            disabled={!form?.alias?.trim() || form?.alias === '__custom__' || !form?.modelId?.trim() || saving === plugin.id + '-model'}
                                            className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 shrink-0"
                                          >
                                            {saving === plugin.id + '-model' ? <Loader2 className="w-3 h-3 animate-spin" /> : t('common.add')}
                                          </button>
                                        </div>
                                      )}
                                      {/* Toggle to custom input */}
                                      {available.length > 0 && (
                                        <button
                                          onClick={() => setAddingModel(prev => ({
                                            ...prev,
                                            [plugin.id]: isCustom ? { alias: '', modelId: '' } : { alias: '__custom__', modelId: '' }
                                          }))}
                                          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                          {isCustom ? t('settings.pluginSelectFromCatalog') : t('settings.pluginCustomModel')}
                                        </button>
                                      )}
                                    </div>
                                  )
                                })()}
                              </div>
                            )
                          })()}
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        )
      })}

      {categories.length === 0 && !loading && (
        <div className="text-center py-10 text-muted-foreground text-sm">
          <ChevronsUpDown className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No plugins found. Make sure OpenClaw is installed.</p>
        </div>
      )}
    </div>
  )
}
