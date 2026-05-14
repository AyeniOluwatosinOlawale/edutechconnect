import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { MessageCircle, CheckCircle, XCircle, Star, TrendingUp, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { Avatar } from '../components/shared/Avatar'
import { StatusDot } from '../components/shared/StatusDot'

interface Stats {
  total: number
  resolved: number
  missed: number
  avgCsat: number | null
}

interface AgentStat {
  id: string
  display_name: string
  avatar_url: string | null
  status: string
  role: string
  total: number
  resolved: number
  missed: number
  active: number
  avgCsat: number | null
  resolveRate: number
}

type Period = '7d' | '30d' | '90d'

const PERIOD_DAYS: Record<Period, number> = { '7d': 7, '30d': 30, '90d': 90 }
const PERIOD_LABEL: Record<Period, string> = { '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days' }

export default function Reports() {
  const { agent } = useAuthStore()
  const [period, setPeriod] = useState<Period>('30d')
  const [stats, setStats] = useState<Stats>({ total: 0, resolved: 0, missed: 0, avgCsat: null })
  const [dailyData, setDailyData] = useState<{ date: string; count: number }[]>([])
  const [agentStats, setAgentStats] = useState<AgentStat[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<keyof AgentStat>('total')

  useEffect(() => {
    if (!agent) return
    setLoading(true)

    const since = new Date()
    since.setDate(since.getDate() - PERIOD_DAYS[period])
    const sinceIso = since.toISOString()

    Promise.all([
      // Overall conversation stats
      supabase
        .from('conversations')
        .select('status, csat_score, started_at, assigned_agent_id')
        .eq('workspace_id', agent.workspace_id)
        .gte('started_at', sinceIso),

      // All agents in workspace
      supabase
        .from('agents')
        .select('id, display_name, avatar_url, status, role')
        .eq('workspace_id', agent.workspace_id)
        .order('display_name'),
    ]).then(([convRes, agentRes]) => {
      const convs = convRes.data ?? []
      const agents = (agentRes.data ?? []) as { id: string; display_name: string; avatar_url: string | null; status: string; role: string }[]

      // ── Overall KPIs ──
      const csatScores = convs.map((r) => r.csat_score).filter(Boolean) as number[]
      setStats({
        total: convs.length,
        resolved: convs.filter((r) => r.status === 'resolved').length,
        missed: convs.filter((r) => r.status === 'missed').length,
        avgCsat: csatScores.length ? csatScores.reduce((a, b) => a + b, 0) / csatScores.length : null,
      })

      // ── Daily chart ──
      const byDate: Record<string, number> = {}
      convs.forEach((r) => {
        const d = r.started_at.split('T')[0]
        byDate[d] = (byDate[d] ?? 0) + 1
      })
      const chartDays = Math.min(PERIOD_DAYS[period], 14)
      setDailyData(
        Object.entries(byDate)
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-chartDays)
          .map(([date, count]) => ({ date: date.slice(5), count })),
      )

      // ── Per-agent stats ──
      const statsMap: Record<string, Omit<AgentStat, 'id' | 'display_name' | 'avatar_url' | 'status' | 'role'>> = {}
      agents.forEach((a) => {
        statsMap[a.id] = { total: 0, resolved: 0, missed: 0, active: 0, avgCsat: null, resolveRate: 0 }
      })

      convs.forEach((c) => {
        if (!c.assigned_agent_id || !statsMap[c.assigned_agent_id]) return
        const s = statsMap[c.assigned_agent_id]
        s.total++
        if (c.status === 'resolved') s.resolved++
        if (c.status === 'missed') s.missed++
        if (c.status === 'active') s.active++
      })

      // Compute CSAT per agent
      agents.forEach((a) => {
        const agentConvs = convs.filter((c) => c.assigned_agent_id === a.id)
        const scores = agentConvs.map((c) => c.csat_score).filter(Boolean) as number[]
        const s = statsMap[a.id]
        s.avgCsat = scores.length ? scores.reduce((x, y) => x + y, 0) / scores.length : null
        s.resolveRate = s.total > 0 ? Math.round((s.resolved / s.total) * 100) : 0
      })

      setAgentStats(
        agents.map((a) => ({ id: a.id, display_name: a.display_name, avatar_url: a.avatar_url, status: a.status, role: a.role, ...statsMap[a.id] }))
      )
      setLoading(false)
    })
  }, [agent, period])

  const sortedAgents = [...agentStats].sort((a, b) => {
    const av = a[sortBy]
    const bv = b[sortBy]
    if (av === null) return 1
    if (bv === null) return -1
    return (bv as number) - (av as number)
  })

  const kpis = [
    { label: 'Total Chats', value: stats.total, icon: <MessageCircle size={18} className="text-brand-500" />, bg: 'bg-brand-50' },
    { label: 'Resolved', value: stats.resolved, icon: <CheckCircle size={18} className="text-green-500" />, bg: 'bg-green-50' },
    { label: 'Missed', value: stats.missed, icon: <XCircle size={18} className="text-red-400" />, bg: 'bg-red-50' },
    { label: 'Avg CSAT', value: stats.avgCsat ? `${stats.avgCsat.toFixed(1)} ★` : '—', icon: <Star size={18} className="text-amber-400" />, bg: 'bg-amber-50' },
  ]

  const sortCols: { key: keyof AgentStat; label: string }[] = [
    { key: 'total', label: 'Total' },
    { key: 'resolved', label: 'Resolved' },
    { key: 'missed', label: 'Missed' },
    { key: 'resolveRate', label: 'Resolve %' },
    { key: 'avgCsat', label: 'CSAT' },
  ]

  return (
    <div className="flex-1 p-6 overflow-auto space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Reports</h1>
          <p className="text-xs text-slate-400 mt-0.5">{PERIOD_LABEL[period]}</p>
        </div>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          {(['7d', '30d', '90d'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${period === p ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-start gap-3">
            <div className={`${kpi.bg} w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0`}>
              {kpi.icon}
            </div>
            <div>
              <p className="text-xs text-slate-500">{kpi.label}</p>
              <p className="text-2xl font-bold text-slate-800 mt-0.5">{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Daily chart */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={15} className="text-brand-500" />
          <h2 className="text-sm font-semibold text-slate-700">Chats over time</h2>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={dailyData} barSize={20}>
            <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12, border: '1px solid #e2e8f0' }} />
            <Bar dataKey="count" fill="#6366f1" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Agent performance table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
          <Users size={15} className="text-brand-500" />
          <h2 className="text-sm font-semibold text-slate-700">Agent Performance</h2>
          <span className="ml-auto text-xs text-slate-400">Sort by:</span>
          <div className="flex gap-1">
            {sortCols.map((col) => (
              <button
                key={col.key}
                onClick={() => setSortBy(col.key)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${sortBy === col.key ? 'bg-brand-100 text-brand-700' : 'text-slate-500 hover:bg-slate-100'}`}
              >
                {col.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
        ) : sortedAgents.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">No agents found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-400 font-medium border-b border-slate-100">
                  <th className="text-left px-5 py-3">Agent</th>
                  <th className="text-right px-4 py-3">Total</th>
                  <th className="text-right px-4 py-3">Active</th>
                  <th className="text-right px-4 py-3">Resolved</th>
                  <th className="text-right px-4 py-3">Missed</th>
                  <th className="text-right px-4 py-3">Resolve %</th>
                  <th className="text-right px-5 py-3">CSAT</th>
                </tr>
              </thead>
              <tbody>
                {sortedAgents.map((a, i) => (
                  <tr key={a.id} className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="relative flex-shrink-0">
                          <Avatar name={a.display_name} url={a.avatar_url} size="sm" />
                          <span className="absolute -bottom-0.5 -right-0.5">
                            <StatusDot status={a.status as 'online' | 'busy' | 'offline'} />
                          </span>
                        </div>
                        <div>
                          <div className="font-medium text-slate-800">{a.display_name}</div>
                          <div className={`text-[10px] font-medium ${a.role === 'admin' ? 'text-violet-600' : 'text-slate-400'}`}>{a.role}</div>
                        </div>
                      </div>
                    </td>
                    <td className="text-right px-4 py-3">
                      <span className="font-semibold text-slate-800">{a.total}</span>
                    </td>
                    <td className="text-right px-4 py-3">
                      <span className={`font-medium ${a.active > 0 ? 'text-green-600' : 'text-slate-400'}`}>{a.active}</span>
                    </td>
                    <td className="text-right px-4 py-3">
                      <span className="font-medium text-green-600">{a.resolved}</span>
                    </td>
                    <td className="text-right px-4 py-3">
                      <span className={`font-medium ${a.missed > 0 ? 'text-red-400' : 'text-slate-400'}`}>{a.missed}</span>
                    </td>
                    <td className="text-right px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-400 rounded-full transition-all"
                            style={{ width: `${a.resolveRate}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-slate-600 w-8 text-right">{a.resolveRate}%</span>
                      </div>
                    </td>
                    <td className="text-right px-5 py-3">
                      {a.avgCsat !== null ? (
                        <span className="inline-flex items-center gap-1 text-amber-500 font-semibold">
                          {a.avgCsat.toFixed(1)} <Star size={11} fill="currentColor" />
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
