'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, ArrowRight, Loader2, CheckCircle2, AlertCircle, Key, Shield, Globe, Link } from 'lucide-react'
import { PROVIDERS } from '@/lib/providers'
import type { AuthMethod } from '@/lib/providers'

type Step = 'provider' | 'authMethod' | 'form' | 'starting' | 'done' | 'error'

export default function SetupPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('provider')
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)
  const [selectedAuthIdx, setSelectedAuthIdx] = useState<number>(0)
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [statusMsg, setStatusMsg] = useState('')

  const provider = PROVIDERS.find(p => p.id === selectedProvider)
  const selectedAuth = provider?.authMethods[selectedAuthIdx]

  const handleSelectProvider = (id: string) => {
    setSelectedProvider(id)
    setFormValues({})
    const p = PROVIDERS.find(p => p.id === id)!
    if (p.authMethods.length > 1) {
      setStep('authMethod')
    } else {
      setSelectedAuthIdx(0)
      // Pre-fill defaults
      const m = p.authMethods[0]
      if (m.type === 'baseUrl' && m.defaultValue) {
        setFormValues({ [m.envKey]: m.defaultValue })
      }
      setStep('form')
    }
  }

  const handleSelectAuth = (idx: number) => {
    setSelectedAuthIdx(idx)
    setFormValues({})
    const m = provider!.authMethods[idx]
    if (m.type === 'baseUrl' && m.defaultValue) {
      setFormValues({ [m.envKey]: m.defaultValue })
    }
    setStep('form')
  }

  const canSubmit = (): boolean => {
    if (!selectedAuth) return false
    switch (selectedAuth.type) {
      case 'apiKey':
        return !!(formValues[selectedAuth.envKey]?.trim())
      case 'apiKeyPair':
        return selectedAuth.fields.filter(f => f.required !== false).every(f => formValues[f.envKey]?.trim())
      case 'setupToken':
        return !!(formValues._token?.trim())
      case 'oauth':
        return false // OAuth is external flow, not submittable from form
      case 'baseUrl':
        return !!(formValues[selectedAuth.envKey]?.trim())
    }
  }

  const handleSubmit = async () => {
    if (!provider || !selectedAuth) return
    setStep('starting')
    setError('')

    try {
      if (selectedAuth.type === 'setupToken') {
        setStatusMsg('Saving setup token...')
        const res = await fetch('/api/auth-profiles', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: selectedAuth.provider, token: formValues._token.trim() }),
        })
        if (!res.ok) throw new Error('Failed to save setup token')
      } else {
        // Collect env entries
        const entries: { key: string; value: string }[] = []

        if (selectedAuth.type === 'apiKey') {
          entries.push({ key: selectedAuth.envKey, value: formValues[selectedAuth.envKey].trim() })
        } else if (selectedAuth.type === 'apiKeyPair') {
          for (const f of selectedAuth.fields) {
            const val = formValues[f.envKey]?.trim()
            if (val) entries.push({ key: f.envKey, value: val })
          }
        } else if (selectedAuth.type === 'baseUrl') {
          entries.push({ key: selectedAuth.envKey, value: formValues[selectedAuth.envKey].trim() })
          // Also set a dummy API key for Ollama
          if (provider.id === 'ollama') {
            entries.push({ key: 'OLLAMA_API_KEY', value: 'ollama-local' })
          }
        }

        if (entries.length > 0) {
          setStatusMsg('Saving credentials...')
          const envRes = await fetch('/api/env', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entries }),
          })
          if (!envRes.ok) throw new Error('Failed to save credentials')
        }
      }

      setStatusMsg('Starting Gateway...')
      const startRes = await fetch('/api/gateway/start', { method: 'POST' })
      const startData = await startRes.json()
      if (!startData.ok) throw new Error(startData.error || 'Gateway failed to start')

      setStep('done')
      setStatusMsg('Gateway is running!')
      setTimeout(() => router.push('/'), 1500)
    } catch (e: unknown) {
      setStep('error')
      setError(e instanceof Error ? e.message : 'Something went wrong')
    }
  }

  const goBack = () => {
    if (step === 'form') {
      if (provider && provider.authMethods.length > 1) setStep('authMethod')
      else setStep('provider')
    } else if (step === 'authMethod') {
      setStep('provider')
    } else if (step === 'error') {
      setStep('form')
      setError('')
    }
  }

  const authMethodIcon = (m: AuthMethod) => {
    switch (m.type) {
      case 'apiKey': return <Key className="w-5 h-5 text-emerald-400" />
      case 'apiKeyPair': return <Key className="w-5 h-5 text-yellow-400" />
      case 'setupToken': return <Shield className="w-5 h-5 text-blue-400" />
      case 'oauth': return <Globe className="w-5 h-5 text-purple-400" />
      case 'baseUrl': return <Link className="w-5 h-5 text-gray-400" />
    }
  }

  const authMethodTitle = (m: AuthMethod) => {
    switch (m.type) {
      case 'apiKey': return m.label || 'API Key'
      case 'apiKeyPair': return 'Credentials'
      case 'setupToken': return 'Setup Token (OAuth)'
      case 'oauth': return 'OAuth'
      case 'baseUrl': return m.label || 'Base URL'
    }
  }

  const authMethodDesc = (m: AuthMethod) => {
    switch (m.type) {
      case 'apiKey': return `Paste your API key (${m.placeholder})`
      case 'apiKeyPair': return `Enter ${m.fields.length} credential fields`
      case 'setupToken': return `Run ${m.command} to generate a token`
      case 'oauth': return m.desc
      case 'baseUrl': return `Server URL (default: ${m.defaultValue})`
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto">
            <Zap className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold">Agent Factory</h1>
          <p className="text-muted-foreground">Configure your AI provider to get started</p>
        </div>

        {/* Step: Choose Provider */}
        {step === 'provider' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Choose a Provider</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-1">
              {PROVIDERS.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleSelectProvider(p.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all hover:border-primary/50 text-left ${
                    selectedProvider === p.id ? 'border-primary bg-primary/5' : 'border-border'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center text-sm font-bold ${p.color}`}>
                    {p.name[0]}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{p.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step: Choose Auth Method */}
        {step === 'authMethod' && provider && (
          <div className="space-y-4">
            <button onClick={goBack} className="text-sm text-muted-foreground hover:text-foreground">← Back</button>
            <h2 className="text-lg font-semibold">{provider.name} — Choose Auth Method</h2>
            <div className="space-y-3">
              {provider.authMethods.map((m, idx) => (
                <button
                  key={idx}
                  onClick={() => m.type !== 'oauth' ? handleSelectAuth(idx) : undefined}
                  disabled={m.type === 'oauth'}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                    m.type === 'oauth'
                      ? 'border-border opacity-60 cursor-not-allowed'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    {authMethodIcon(m)}
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{authMethodTitle(m)}</div>
                    <div className="text-xs text-muted-foreground">{authMethodDesc(m)}</div>
                    {m.type === 'oauth' && (
                      <div className="text-xs text-yellow-500 mt-1">Coming soon — use API Key for now</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step: Dynamic Form */}
        {step === 'form' && provider && selectedAuth && (
          <div className="space-y-4">
            <button onClick={goBack} className="text-sm text-muted-foreground hover:text-foreground">← Back</button>
            <h2 className="text-lg font-semibold">
              {provider.name} — {authMethodTitle(selectedAuth)}
            </h2>
            <div className="space-y-3">
              {/* API Key */}
              {selectedAuth.type === 'apiKey' && (
                <>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="password"
                      value={formValues[selectedAuth.envKey] || ''}
                      onChange={e => setFormValues({ ...formValues, [selectedAuth.envKey]: e.target.value })}
                      placeholder={selectedAuth.placeholder}
                      autoFocus
                      className="w-full bg-muted border border-border rounded-xl pl-10 pr-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
                      onKeyDown={e => { if (e.key === 'Enter' && canSubmit()) handleSubmit() }}
                    />
                  </div>
                  {selectedAuth.label && (
                    <p className="text-xs text-muted-foreground">{selectedAuth.label}</p>
                  )}
                </>
              )}

              {/* API Key Pair (multi-field) */}
              {selectedAuth.type === 'apiKeyPair' && (
                <>
                  {selectedAuth.fields.map(f => (
                    <div key={f.envKey} className="space-y-1">
                      <label className="text-sm font-medium">
                        {f.label}
                        {f.required !== false && <span className="text-destructive ml-1">*</span>}
                      </label>
                      <input
                        type={f.envKey.includes('SECRET') ? 'password' : 'text'}
                        value={formValues[f.envKey] || ''}
                        onChange={e => setFormValues({ ...formValues, [f.envKey]: e.target.value })}
                        placeholder={f.placeholder}
                        className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
                      />
                    </div>
                  ))}
                </>
              )}

              {/* Setup Token */}
              {selectedAuth.type === 'setupToken' && (
                <>
                  <div className="relative">
                    <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="password"
                      value={formValues._token || ''}
                      onChange={e => setFormValues({ ...formValues, _token: e.target.value })}
                      placeholder={selectedAuth.tokenPrefix + '...'}
                      autoFocus
                      className="w-full bg-muted border border-border rounded-xl pl-10 pr-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
                      onKeyDown={e => { if (e.key === 'Enter' && canSubmit()) handleSubmit() }}
                    />
                  </div>
                  <div className="p-3 bg-muted/50 border border-border rounded-lg space-y-1.5">
                    <p className="text-xs text-muted-foreground"><strong>How to get a setup token:</strong></p>
                    <ol className="text-xs text-muted-foreground list-decimal list-inside space-y-0.5">
                      <li>Run <code className="bg-muted px-1 rounded">{selectedAuth.command}</code> in terminal</li>
                      <li>Complete the OAuth flow in your browser</li>
                      <li>Copy the generated token (starts with <code className="bg-muted px-1 rounded">{selectedAuth.tokenPrefix}</code>)</li>
                      <li>Paste it above</li>
                    </ol>
                  </div>
                </>
              )}

              {/* Base URL */}
              {selectedAuth.type === 'baseUrl' && (
                <>
                  <div className="relative">
                    <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={formValues[selectedAuth.envKey] || ''}
                      onChange={e => setFormValues({ ...formValues, [selectedAuth.envKey]: e.target.value })}
                      placeholder={selectedAuth.placeholder}
                      autoFocus
                      className="w-full bg-muted border border-border rounded-xl pl-10 pr-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
                      onKeyDown={e => { if (e.key === 'Enter' && canSubmit()) handleSubmit() }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Default: <code className="bg-muted px-1 rounded">{selectedAuth.defaultValue}</code>
                  </p>
                </>
              )}

              <p className="text-xs text-muted-foreground">
                {selectedAuth.type === 'setupToken'
                  ? <>Token stored in <code className="bg-muted px-1 rounded">auth-profiles.json</code>. Never leaves this machine.</>
                  : <>Credentials stored locally in <code className="bg-muted px-1 rounded">.env</code>. Never leave this machine.</>
                }
              </p>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit()}
                className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Save & Start Gateway
              </button>
            </div>
          </div>
        )}

        {/* Step: Starting */}
        {step === 'starting' && (
          <div className="text-center space-y-4 py-8">
            <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto" />
            <p className="text-muted-foreground">{statusMsg}</p>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <div className="text-center space-y-4 py-8">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
            <p className="font-semibold text-lg">All set!</p>
            <p className="text-muted-foreground">Redirecting to Dashboard...</p>
          </div>
        )}

        {/* Step: Error */}
        {step === 'error' && (
          <div className="space-y-4 py-4">
            <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/30 rounded-xl">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-destructive">Failed to start Gateway</p>
                <p className="text-sm text-muted-foreground mt-1">{error}</p>
              </div>
            </div>
            <button onClick={goBack} className="w-full py-3 border border-border rounded-xl hover:bg-muted transition-colors">
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
