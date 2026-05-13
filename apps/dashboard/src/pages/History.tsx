import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { formatTime } from '../lib/utils'

interface HistoryConv {
  id: string
  status: string
  started_at: string
  resolved_at: string | null
  csat_score: number | null
  visitors: { name: string | null; email: string | null }
  agents: { display_name: string } | null
}

const statusBadge: Record<string, string> = {
  resolved: 'bg-green-100 text-green-700',
  missed: 'bg-red-100 text-red-700',
  escalated: 'bg-purple-100 text-purple-700',
}

export default function History() {
  const { agent } = useAuthStore()
  const [convs, setConvs] = useState<HistoryConv[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!agent) return
    supabase
      .from('conversations')
      .select('id, status, started_at, resolved_at, csat_score, visitors(name, email), agents:assigned_agent_id(display_name)')
      .eq('workspace_id', agent.workspace_id)
      .in('status', ['resolved', 'missed', 'escalated'])
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setConvs((data as unknown as HistoryConv[]) ?? [])
        setLoading(false)
      })
  }, [agent])

  const filtered = convs.filter((c) => {
    if (!search) return true
    return [c.visitors?.name, c.visitors?.email, c.agents?.display_name].some((v) =>
      v?.toLowerCase().includes(search.toLowerCase()),
    )
  })

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">History</h1>
          <p className="text-sm text-slate-400">All resolved, missed, and escalated conversations</p>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="pl-8 pr-4 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-brand-400 transition-colors"
          />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                {['Visitor', 'Agent', 'Status', 'Started', 'Resolved', 'CSAT'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-700">{c.visitors?.name ?? 'Anonymous'}</p>
                    {c.visitors?.email && <p className="text-xs text-slate-400">{c.visitors.email}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.agents?.display_name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge[c.status] ?? 'bg-slate-100 text-slate-600'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{formatTime(c.started_at)}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{c.resolved_at ? formatTime(c.resolved_at) : '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{c.csat_score ? '⭐'.repeat(c.csat_score) : '—'}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">No conversations found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
