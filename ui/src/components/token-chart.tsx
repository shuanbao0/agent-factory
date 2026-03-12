'use client'
import React from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { useAppStore } from '@/lib/store'

export const TokenChart = React.memo(function TokenChart() {
  const usageDaily = useAppStore(s => s.usageDaily)

  const data = usageDaily.map(d => ({
    date: d.date.replace(/^\d{4}-/, '').replace('-', '/'),
    tokens: d.tokens,
    cost: d.cost,
  }))

  if (data.length === 0) {
    return <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">暂无数据</div>
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(216 34% 17%)" />
        <XAxis dataKey="date" tick={{ fill: 'hsl(215 20% 55%)', fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: 'hsl(215 20% 55%)', fontSize: 12 }} axisLine={false} tickLine={false}
          tickFormatter={(v) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : `${(v/1000).toFixed(0)}K`}
        />
        <Tooltip
          contentStyle={{ background: 'hsl(224 71% 6%)', border: '1px solid hsl(216 34% 17%)', borderRadius: 8, color: 'hsl(213 31% 91%)' }}
          formatter={(value: number, name: string) => {
            if (name === 'tokens') return [`${value.toLocaleString()} tokens`, 'Usage']
            return [value, name]
          }}
        />
        <Bar dataKey="tokens" fill="hsl(210 40% 50%)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
})
