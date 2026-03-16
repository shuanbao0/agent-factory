'use client'
import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from '@/lib/i18n'
import { useAppStore } from '@/lib/store'
import { DollarSign, Zap, ArrowUpDown, Activity } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

interface CostEntry {
  ts: string
  date: string
  model: string
  inputTokens: number
  outputTokens: number
  cost: number
  source: string
  agentId?: string
}

interface FetchedCostData {
  entries: CostEntry[]
  summary: Array<{ date: string; cost: number; inputTokens: number; outputTokens: number; calls: number }>
  totalCost: number
  totalInputTokens: number
  totalOutputTokens: number
}

type Period = 'today' | '7d' | '30d'

function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export default function CostsPage() {
  const { t } = useTranslation()
  const [period, setPeriod] = useState<Period>('7d')
  const [fetchedData, setFetchedData] = useState<FetchedCostData | null>(null)
  const [loading, setLoading] = useState(true)
  const sseCostData = useAppStore(s => s.costData)

  const fetchCosts = useCallback(async (p: Period) => {
    try {
      const res = await fetch(`/api/costs?period=${p}`)
      if (res.ok) {
        setFetchedData(await res.json())
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  // Fetch on period change; for '7d' rely primarily on SSE
  useEffect(() => {
    setLoading(true)
    fetchCosts(period)
    // Only poll for non-default periods (SSE handles 7d)
    if (period !== '7d') {
      const timer = setInterval(() => fetchCosts(period), 30000)
      return () => clearInterval(timer)
    }
  }, [period, fetchCosts])

  // For 7d period, prefer SSE data; for others, use fetched data
  const data = period === '7d' && sseCostData
    ? {
        entries: fetchedData?.entries || [],
        summary: sseCostData.summary.map(s => ({
          date: s.date,
          cost: s.cost,
          inputTokens: s.inputTokens,
          outputTokens: s.outputTokens,
          calls: s.calls,
        })),
        totalCost: sseCostData.totalCost,
        totalInputTokens: sseCostData.totalInputTokens,
        totalOutputTokens: sseCostData.totalOutputTokens,
      }
    : fetchedData

  // Aggregate by source and model
  const bySource: Record<string, number> = {}
  const byModel: Record<string, number> = {}
  if (data?.entries) {
    for (const e of data.entries) {
      bySource[e.source] = (bySource[e.source] || 0) + (e.cost || 0)
      byModel[e.model] = (byModel[e.model] || 0) + (e.cost || 0)
    }
  }

  // Also aggregate from SSE summary by source when available
  if (period === '7d' && sseCostData?.summary) {
    for (const s of sseCostData.summary) {
      if (!bySource[s.source]) bySource[s.source] = 0
      // Only add if entries weren't available (avoid double counting)
      if (!data?.entries?.length) {
        bySource[s.source] += s.cost || 0
      }
    }
  }

  const sortedSources = Object.entries(bySource).sort((a, b) => b[1] - a[1])
  const sortedModels = Object.entries(byModel).sort((a, b) => b[1] - a[1])

  const totalCalls = data?.entries?.length || 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('costs.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('costs.subtitle')}</p>
        </div>
        <div className="flex gap-1 bg-card rounded-lg border border-border p-1">
          {(['today', '7d', '30d'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                period === p
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(`costs.period.${p}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={<DollarSign className="w-4 h-4" />}
          label={t('costs.totalCost')}
          value={formatCost(data?.totalCost || 0)}
          loading={loading}
        />
        <SummaryCard
          icon={<Zap className="w-4 h-4" />}
          label={t('costs.inputTokens')}
          value={formatTokens(data?.totalInputTokens || 0)}
          loading={loading}
        />
        <SummaryCard
          icon={<ArrowUpDown className="w-4 h-4" />}
          label={t('costs.outputTokens')}
          value={formatTokens(data?.totalOutputTokens || 0)}
          loading={loading}
        />
        <SummaryCard
          icon={<Activity className="w-4 h-4" />}
          label={t('costs.apiCalls')}
          value={String(totalCalls)}
          loading={loading}
        />
      </div>

      {/* Daily Cost Chart */}
      {data?.summary && data.summary.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-6">
          <h2 className="text-sm font-semibold text-foreground mb-4">{t('costs.dailyCost')}</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.summary}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(v: string) => v.slice(5)}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(v: number) => `$${v.toFixed(2)}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  formatter={(value: number) => [`$${value.toFixed(4)}`, 'Cost']}
                  labelFormatter={(label: string) => label}
                />
                <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Breakdown: By Source + By Model */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* By Source */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h2 className="text-sm font-semibold text-foreground mb-3">{t('costs.bySource')}</h2>
          {sortedSources.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('costs.noData')}</p>
          ) : (
            <div className="space-y-2">
              {sortedSources.map(([source, cost]) => (
                <div key={source} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground font-mono text-xs">{source}</span>
                  <span className="text-foreground font-medium">{formatCost(cost)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* By Model */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h2 className="text-sm font-semibold text-foreground mb-3">{t('costs.byModel')}</h2>
          {sortedModels.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('costs.noData')}</p>
          ) : (
            <div className="space-y-2">
              {sortedModels.map(([model, cost]) => (
                <div key={model} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground font-mono text-xs">{model}</span>
                  <span className="text-foreground font-medium">{formatCost(cost)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Entries Table */}
      {data?.entries && data.entries.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-6">
          <h2 className="text-sm font-semibold text-foreground mb-3">
            {t('costs.recentEntries')} ({Math.min(data.entries.length, 50)})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium">{t('costs.colTime')}</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium">{t('costs.colSource')}</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium">{t('costs.colModel')}</th>
                  <th className="text-right py-2 px-2 text-muted-foreground font-medium">In/Out</th>
                  <th className="text-right py-2 px-2 text-muted-foreground font-medium">{t('costs.colCost')}</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.slice(-50).reverse().map((e, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-accent/30">
                    <td className="py-1.5 px-2 text-muted-foreground font-mono">
                      {new Date(e.ts).toLocaleTimeString()}
                    </td>
                    <td className="py-1.5 px-2 text-foreground">{e.source}</td>
                    <td className="py-1.5 px-2 text-muted-foreground font-mono">{e.model?.split('-').slice(-2).join('-') || e.model}</td>
                    <td className="py-1.5 px-2 text-right text-muted-foreground">
                      {formatTokens(e.inputTokens)}/{formatTokens(e.outputTokens)}
                    </td>
                    <td className="py-1.5 px-2 text-right text-foreground font-medium">{formatCost(e.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && (!data?.entries || data.entries.length === 0) && (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <DollarSign className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">{t('costs.noData')}</p>
          <p className="text-xs text-muted-foreground/60 mt-1">{t('costs.noDataHint')}</p>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ icon, label, value, loading }: {
  icon: React.ReactNode
  label: string
  value: string
  loading: boolean
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-xl font-bold text-foreground">
        {loading ? '...' : value}
      </p>
    </div>
  )
}
