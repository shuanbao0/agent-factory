'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from '@/lib/i18n'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import PluginConfigForm from '@/components/plugin-config-form'
import {
  Puzzle, Brain, Search, Globe, Mic, ImageIcon, Cpu, Network, MessageSquare, Wrench,
  ChevronDown, ChevronRight, Save, Loader2, Settings2, ChevronsUpDown, Info, Check, KeyRound,
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

  useEffect(() => { fetchPlugins() }, [fetchPlugins])

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
                                if (es.configured.length > 0) return (
                                  <span className="flex items-center gap-1 text-xs text-emerald-400" title={es.configured.join(', ')}>
                                    <KeyRound className="w-3 h-3" /><Check className="w-3 h-3" />
                                  </span>
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
                                  const es = getPluginEnvStatus(plugin)
                                  if (es.configured.length > 0) return (
                                    <span className="flex items-center gap-1 text-xs text-emerald-400" title={es.configured.join(', ')}>
                                      <KeyRound className="w-3 h-3" /><Check className="w-3 h-3" />
                                    </span>
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
