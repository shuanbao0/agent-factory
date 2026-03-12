'use client'
import React from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { useAppStore } from '@/lib/store'

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#6366f1', '#14b8a6']

export const AgentTokenChart = React.memo(function AgentTokenChart() {
  const usageByAgent = useAppStore(s => s.usageByAgent)

  const data = usageByAgent
    .filter(a => a.totals.totalTokens > 0)
    .map(a => ({
      name: a.agentId,
      tokens: a.totals.totalTokens,
    }))

  if (data.length === 0) {
    return <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">暂无数据</div>
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <PieChart>
        <Pie
          data={data}
          cx="50%" cy="50%"
          innerRadius={60} outerRadius={90}
          paddingAngle={3}
          dataKey="tokens"
          nameKey="name"
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ background: 'hsl(224 71% 6%)', border: '1px solid hsl(216 34% 17%)', borderRadius: 8, color: 'hsl(213 31% 91%)' }}
          formatter={(value: number) => [`${value.toLocaleString()} tokens`]}
        />
      </PieChart>
    </ResponsiveContainer>
  )
})
