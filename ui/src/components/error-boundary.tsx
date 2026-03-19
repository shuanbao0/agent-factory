'use client'

import React from 'react'
import { useTranslation } from '@/lib/i18n'

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[af:error-boundary]', error.message, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} onReset={() => this.setState({ hasError: false, error: null })} />
    }
    return this.props.children
  }
}

function ErrorFallback({ error, onReset }: { error: Error | null; onReset: () => void }) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-8">
      <div className="text-4xl">&#x26A0;</div>
      <h2 className="text-xl font-semibold text-zinc-200">{t('errorBoundary.title')}</h2>
      <p className="text-sm text-zinc-400 max-w-md text-center">{t('errorBoundary.description')}</p>
      {error && (
        <pre className="text-xs text-red-400 bg-zinc-900 rounded p-3 max-w-lg overflow-auto">
          {error.message}
        </pre>
      )}
      <button
        onClick={() => { onReset(); window.location.reload() }}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
      >
        {t('errorBoundary.reload')}
      </button>
    </div>
  )
}
