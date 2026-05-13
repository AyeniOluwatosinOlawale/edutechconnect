import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

interface Stats {
  total: number
  resolved: number
  missed: number
  avgCsat: number | null
}

export default function Reports() {
  const { agent } = useAuthStore()
  const [stats, setStats] = useState<Stats>({ total: 0, resolved: 0, missed: 0, avgCsat: null })
  const [dailyData, setDailyData] = useState<{ date: string; count: number }[]>([])

  useEffect(() => {
    if (!agent) return

    const since = new Date()
    since.setDate(since.getDate() - 30)

    supabase
      .from('conversations')
      .select('status, csat_score, started_at')
      .eq('workspace_id', agent.workspace_id)
      .gte('started_at', since.toISOString())
      .then(({ data }) => {
        const rows = data ?? []
        const csatScores = rows.map((r) => r.csat_score).filter(Boolean) as number[]

        setStats({
          total: rows.length,
          resolved: rows.filter((r) => r.status === 'resolved').length,
          missed: rows.filter((r) => r.status === 'missed').length,
          avgCsat: csatScores.length ? csatScores.reduce((a, b) => a + b, 0) / csatScores.length : null,
        })

        // Group by date
        const byDate: Record<string, number> = {}
        rows.forEach((r) => {
          const d = r.started_at.split('T')[0]
          byDate[d] = (byDate[d] ?? 0) + 1
        })
        setDailyData(
          Object.entries(byDate)
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-14)
            .map(([date, count]) => ({ date: date.slice(5), count })),
        )
      })
  }, [agent])

  const kpis = [
    { label: 'Total Chats (30d)', value: stats.total },
    { label: 'Resolved', value: stats.resolved },
    { label: 'Missed', value: stats.missed },
    { label: 'Avg CSAT', value: stats.avgCsat ? `${stats.avgCsat.toFixed(1)} ⭐` : 'N/A' },
  ]

  return (
    <div className="flex-1 p-6 overflow-auto">
      <h1 className="text-lg font-semibold text-slate-800 mb-6">Reports</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 mb-1">{kpi.label}</p>
            <p className="text-2xl font-bold text-slate-800">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Chats per day (last 14 days)</h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={dailyData}>
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
