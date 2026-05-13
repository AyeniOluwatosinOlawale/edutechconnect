import { useEffect, useState } from 'react'
import { Monitor, Smartphone, ExternalLink } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useChatStore } from '../stores/chatStore'
import { formatTime } from '../lib/utils'

interface Session {
  id: string
  visitor_id: string
  current_url: string | null
  last_seen_at: string
  visitors: { name: string | null; email: string | null; device_type: string | null; country_code: string | null }
}

export default function Visitors() {
  const { agent } = useAuthStore()
  const { selectConversation } = useChatStore()
  const [sessions, setSessions] = useState<Session[]>([])

  useEffect(() => {
    if (!agent) return
    const load = () =>
      supabase
        .from('widget_sessions')
        .select('id, visitor_id, current_url, last_seen_at, visitors(name, email, device_type, country_code)')
        .eq('workspace_id', agent.workspace_id)
        .eq('is_active', true)
        .order('last_seen_at', { ascending: false })
        .then(({ data }) => setSessions((data as unknown as Session[]) ?? []))

    load()
    const interval = setInterval(load, 15_000)
    return () => clearInterval(interval)
  }, [agent])

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-slate-800">Live Visitors</h1>
        <p className="text-sm text-slate-400">{sessions.length} visitor{sessions.length !== 1 ? 's' : ''} currently on site</p>
      </div>

      {sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-slate-400">
          <span className="text-4xl mb-3">👀</span>
          <p>No visitors currently online</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Visitor</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Current Page</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Device</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Last Seen</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const DeviceIcon = s.visitors?.device_type === 'mobile' ? Smartphone : Monitor
                return (
                  <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-700">{s.visitors?.name ?? 'Anonymous'}</p>
                      {s.visitors?.email && <p className="text-xs text-slate-400">{s.visitors.email}</p>}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="text-xs text-slate-500 truncate">{s.current_url ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <DeviceIcon size={15} className="text-slate-400" />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{formatTime(s.last_seen_at)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => selectConversation(s.visitor_id)}
                        className="text-xs font-medium text-brand-500 hover:underline flex items-center gap-1"
                      >
                        <ExternalLink size={12} /> Chat
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
