'use client'

import { useState } from 'react'
import { useTranslation } from '@/lib/i18n'
import { PROVIDERS } from '@/lib/providers'
import type { AuthMethod, ProviderDef } from '@/lib/providers'
import {
  Key, Shield, Globe, Link as LinkIcon,
  Eye, EyeOff, Save, Loader2, Trash2, Check,
} from 'lucide-react'

export type ProviderAuthData = {
  authMode: 'setup-token' | 'oauth' | 'env-var' | 'config' | 'none'
  authDetail?: string
  hasSetupToken: boolean
  setupTokenPreview: string | null
  setupTokenProfileId: string | null
}

interface Props {
  pluginId: string
  providerData: ProviderAuthData | null
  onSaved: () => void
  onCancel: () => void
}

function getProviderDef(pluginId: string): ProviderDef | undefined {
  return PROVIDERS.find(p => p.id === pluginId)
}

function authIcon(m: AuthMethod) {
  switch (m.type) {
    case 'apiKey': return <Key className="w-3.5 h-3.5 text-emerald-400" />
    case 'apiKeyPair': return <Key className="w-3.5 h-3.5 text-yellow-400" />
    case 'setupToken': return <Shield className="w-3.5 h-3.5 text-blue-400" />
    case 'oauth': return <Globe className="w-3.5 h-3.5 text-purple-400" />
    case 'baseUrl': return <LinkIcon className="w-3.5 h-3.5 text-gray-400" />
  }
}

function authTitle(m: AuthMethod, t: (k: string) => string) {
  switch (m.type) {
    case 'apiKey': return m.label || t('settings.authMethodApiKey')
    case 'apiKeyPair': return t('settings.authMethodCredentials')
    case 'setupToken': return t('settings.authMethodSetupToken')
    case 'oauth': return t('settings.authMethodOAuth')
    case 'baseUrl': return m.label || t('settings.authMethodBaseUrl')
  }
}

export default function ProviderAuthPanel({ pluginId, providerData, onSaved, onCancel }: Props) {
  const { t } = useTranslation()
  const providerDef = getProviderDef(pluginId)

  const [selectedIdx, setSelectedIdx] = useState(0)
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  if (!providerDef) return null

  const methods = providerDef.authMethods
  const selected = methods[selectedIdx]
  if (!selected) return null

  const canSubmit = (): boolean => {
    switch (selected.type) {
      case 'apiKey': return !!(formValues[selected.envKey]?.trim())
      case 'apiKeyPair': return selected.fields.filter(f => f.required !== false).every(f => formValues[f.envKey]?.trim())
      case 'setupToken': return !!(formValues._token?.trim())
      case 'oauth': return false
      case 'baseUrl': return !!(formValues[selected.envKey]?.trim())
    }
  }

  const handleSave = async () => {
    if (!canSubmit()) return
    setSaving(true)
    setResult(null)
    try {
      if (selected.type === 'setupToken') {
        const res = await fetch('/api/auth-profiles', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: selected.provider, token: formValues._token.trim() }),
        })
        if (!res.ok) throw new Error('Failed to save setup token')
      } else {
        const entries: { key: string; value: string }[] = []
        if (selected.type === 'apiKey') {
          entries.push({ key: selected.envKey, value: formValues[selected.envKey].trim() })
        } else if (selected.type === 'apiKeyPair') {
          for (const f of selected.fields) {
            const val = formValues[f.envKey]?.trim()
            if (val) entries.push({ key: f.envKey, value: val })
          }
        } else if (selected.type === 'baseUrl') {
          entries.push({ key: selected.envKey, value: formValues[selected.envKey].trim() })
          if (pluginId === 'ollama') {
            entries.push({ key: 'OLLAMA_API_KEY', value: 'ollama-local' })
          }
        }
        if (entries.length > 0) {
          const res = await fetch('/api/env', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entries }),
          })
          if (!res.ok) throw new Error('Failed to save credentials')
        }
      }
      setResult({ ok: true, message: t('settings.authSaveSuccess') })
      setFormValues({})
      onSaved()
    } catch {
      setResult({ ok: false, message: t('settings.authSaveFailed') })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteToken = async () => {
    if (!providerData?.setupTokenProfileId) return
    setDeleting(true)
    try {
      await fetch('/api/auth-profiles', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: providerData.setupTokenProfileId }),
      })
      onSaved()
    } catch { /* ignore */ }
    finally { setDeleting(false) }
  }

  const toggleVisibility = (field: string) => {
    setVisibleFields(prev => {
      const n = new Set(prev)
      n.has(field) ? n.delete(field) : n.add(field)
      return n
    })
  }

  const selectMethod = (idx: number) => {
    setSelectedIdx(idx)
    setFormValues({})
    setResult(null)
    const m = methods[idx]
    if (m.type === 'baseUrl' && m.defaultValue) {
      setFormValues({ [m.envKey]: m.defaultValue })
    }
  }

  return (
    <div className="px-4 pb-3 pt-2 border-t border-border/50 space-y-3">
      {/* Current auth status */}
      {providerData && providerData.authMode !== 'none' && (
        <div className="flex items-center gap-2 text-xs">
          <Check className="w-3 h-3 text-emerald-400" />
          <span className="text-emerald-400">
            {providerData.authMode === 'setup-token' && `Setup Token (${providerData.setupTokenPreview || ''})`}
            {providerData.authMode === 'oauth' && 'OAuth'}
            {providerData.authMode === 'env-var' && `${t('settings.authMethodApiKey')} (${providerData.authDetail || ''})`}
            {providerData.authMode === 'config' && t('settings.authMethodApiKey')}
          </span>
          {/* Delete token button */}
          {providerData.authMode === 'setup-token' && providerData.setupTokenProfileId && (
            <button
              onClick={handleDeleteToken}
              disabled={deleting}
              className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
              title={t('settings.authDeleteToken')}
            >
              {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            </button>
          )}
        </div>
      )}

      {/* Auth method tabs (only if >1 method) */}
      {methods.length > 1 && (
        <div className="flex gap-1">
          {methods.map((m, idx) => (
            <button
              key={idx}
              onClick={() => m.type !== 'oauth' ? selectMethod(idx) : undefined}
              disabled={m.type === 'oauth'}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                idx === selectedIdx
                  ? 'bg-primary/15 text-primary border border-primary/30'
                  : m.type === 'oauth'
                    ? 'text-muted-foreground/50 cursor-not-allowed'
                    : 'text-muted-foreground hover:bg-muted border border-transparent'
              }`}
            >
              {authIcon(m)}
              <span>{authTitle(m, t)}</span>
              {m.type === 'oauth' && <span className="text-[10px]">({t('settings.authMethodComingSoon')})</span>}
            </button>
          ))}
        </div>
      )}

      {/* Form fields by auth type */}
      <div className="space-y-2">
        {/* apiKey */}
        {selected.type === 'apiKey' && (
          <div className="flex gap-2">
            <input
              type={visibleFields.has(selected.envKey) ? 'text' : 'password'}
              value={formValues[selected.envKey] || ''}
              onChange={e => setFormValues({ ...formValues, [selected.envKey]: e.target.value })}
              placeholder={selected.placeholder}
              className="flex-1 px-2.5 py-1.5 text-xs font-mono bg-muted border border-border rounded-md focus:ring-2 focus:ring-primary/50 focus:outline-none"
              onKeyDown={e => { if (e.key === 'Enter' && canSubmit()) handleSave() }}
            />
            <button onClick={() => toggleVisibility(selected.envKey)} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground">
              {visibleFields.has(selected.envKey) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}

        {/* apiKeyPair */}
        {selected.type === 'apiKeyPair' && selected.fields.map(f => (
          <div key={f.envKey} className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {f.label}
              {f.required !== false && <span className="text-destructive ml-0.5">*</span>}
            </label>
            <div className="flex gap-2">
              <input
                type={f.envKey.includes('SECRET') ? (visibleFields.has(f.envKey) ? 'text' : 'password') : 'text'}
                value={formValues[f.envKey] || ''}
                onChange={e => setFormValues({ ...formValues, [f.envKey]: e.target.value })}
                placeholder={f.placeholder}
                className="flex-1 px-2.5 py-1.5 text-xs font-mono bg-muted border border-border rounded-md focus:ring-2 focus:ring-primary/50 focus:outline-none"
              />
              {f.envKey.includes('SECRET') && (
                <button onClick={() => toggleVisibility(f.envKey)} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground">
                  {visibleFields.has(f.envKey) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
          </div>
        ))}

        {/* setupToken */}
        {selected.type === 'setupToken' && (
          <>
            <div className="flex gap-2">
              <input
                type={visibleFields.has('_token') ? 'text' : 'password'}
                value={formValues._token || ''}
                onChange={e => setFormValues({ ...formValues, _token: e.target.value })}
                placeholder={selected.tokenPrefix + '...'}
                className="flex-1 px-2.5 py-1.5 text-xs font-mono bg-muted border border-border rounded-md focus:ring-2 focus:ring-primary/50 focus:outline-none"
                onKeyDown={e => { if (e.key === 'Enter' && canSubmit()) handleSave() }}
              />
              <button onClick={() => toggleVisibility('_token')} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground">
                {visibleFields.has('_token') ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="p-2.5 bg-muted/50 border border-border rounded-md space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground">{t('settings.authSetupTokenInstructions')}</p>
              <ol className="text-[11px] text-muted-foreground list-decimal list-inside space-y-0.5">
                <li>{t('settings.authSetupTokenStep1').replace('{command}', '')} <code className="bg-muted px-1 rounded">{selected.command}</code></li>
                <li>{t('settings.authSetupTokenStep2')}</li>
                <li>{t('settings.authSetupTokenStep3').replace('{prefix}', '')} <code className="bg-muted px-1 rounded">{selected.tokenPrefix}</code></li>
                <li>{t('settings.authSetupTokenStep4')}</li>
              </ol>
            </div>
          </>
        )}

        {/* baseUrl */}
        {selected.type === 'baseUrl' && (
          <div className="space-y-1">
            <input
              type="text"
              value={formValues[selected.envKey] || ''}
              onChange={e => setFormValues({ ...formValues, [selected.envKey]: e.target.value })}
              placeholder={selected.placeholder}
              className="w-full px-2.5 py-1.5 text-xs font-mono bg-muted border border-border rounded-md focus:ring-2 focus:ring-primary/50 focus:outline-none"
              onKeyDown={e => { if (e.key === 'Enter' && canSubmit()) handleSave() }}
            />
            <p className="text-[11px] text-muted-foreground">
              Default: <code className="bg-muted px-1 rounded">{selected.defaultValue}</code>
            </p>
          </div>
        )}

        {/* oauth placeholder */}
        {selected.type === 'oauth' && (
          <p className="text-xs text-muted-foreground/60 italic">{t('settings.authMethodComingSoon')}</p>
        )}
      </div>

      {/* Security hint */}
      {selected.type !== 'oauth' && (
        <p className="text-[10px] text-muted-foreground/60">
          {selected.type === 'setupToken' ? t('settings.authTokenStoredLocally') : t('settings.authEnvStoredLocally')}
        </p>
      )}

      {/* Save / Cancel */}
      {selected.type !== 'oauth' && (
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !canSubmit()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            {t('common.save')}
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs border border-border rounded-md hover:bg-muted transition-colors"
          >
            {t('common.cancel')}
          </button>
          {result && (
            <span className={`text-xs ${result.ok ? 'text-emerald-400' : 'text-red-400'}`}>{result.message}</span>
          )}
        </div>
      )}
    </div>
  )
}

/** Check if a plugin matches a known provider definition */
export function hasProviderDef(pluginId: string): boolean {
  return PROVIDERS.some(p => p.id === pluginId)
}
