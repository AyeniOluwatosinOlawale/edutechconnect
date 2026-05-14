import { useEffect, useState, FormEvent } from 'react'
import { UserPlus, Trash2, Shield, User } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { Avatar } from '../../components/shared/Avatar'
import { StatusDot } from '../../components/shared/StatusDot'

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1'

interface AgentRow {
  id: string
  display_name: string
  avatar_url: string | null
  role: 'admin' | 'agent'
  status: 'online' | 'busy' | 'offline'
  email?: string
}

export default function AgentsSettings() {
  const { agent: me } = useAuthStore()
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteMsg, setInviteMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    if (!me) return
    setLoading(true)
    supabase
      .from('agents')
      .select('id, display_name, avatar_url, role, status')
      .eq('workspace_id', me.workspace_id)
      .order('display_name')
      .then(({ data }) => {
        setAgents((data as AgentRow[]) ?? [])
        setLoading(false)
      })
  }, [me])

  async function changeRole(agentId: string, role: 'admin' | 'agent') {
    await supabase.from('agents').update({ role }).eq('id', agentId)
    setAgents((prev) => prev.map((a) => (a.id === agentId ? { ...a, role } : a)))
  }

  async function deactivate(agentId: string) {
    if (!confirm('Remove this agent from the workspace?')) return
    await supabase.from('agents').update({ status: 'offline' }).eq('id', agentId)
    setAgents((prev) => prev.filter((a) => a.id !== agentId))
  }

  async function invite(e: FormEvent) {
    e.preventDefault()
    if (!me || !inviteEmail.trim()) return
    setInviting(true)
    setInviteMsg(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${FUNCTIONS_URL}/invite-agent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Failed to send invite')
      setInviteMsg({ type: 'ok', text: `Invitation sent to ${inviteEmail.trim()}` })
      setInviteEmail('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send invite'
      setInviteMsg({ type: 'err', text: msg })
    } finally {
      setInviting(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-base font-semibold text-slate-800 mb-6">Agents</h2>

      {/* Invite form */}
      {me?.role === 'admin' && (
        <form onSubmit={invite} className="bg-white border border-slate-200 rounded-xl p-4 mb-6 flex flex-col gap-3">
          <p className="text-sm font-medium text-slate-700">Invite a new agent</p>
          <div className="flex gap-3">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="agent@example.com"
              required
              className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-400"
            />
            <button
              type="submit"
              disabled={inviting}
              className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
            >
              <UserPlus size={14} /> {inviting ? 'Sending…' : 'Invite'}
            </button>
          </div>
          {inviteMsg && (
            <p className={`text-xs font-medium ${inviteMsg.type === 'ok' ? 'text-green-600' : 'text-red-500'}`}>
              {inviteMsg.text}
            </p>
          )}
        </form>
      )}

      {/* Agent list */}
      {loading ? (
        <p className="text-sm text-slate-400">Loading agents…</p>
      ) : (
        <div className="flex flex-col gap-2">
          {agents.map((a) => (
            <div key={a.id} className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="relative flex-shrink-0">
                <Avatar name={a.display_name} url={a.avatar_url} size="sm" />
                <span className="absolute -bottom-0.5 -right-0.5">
                  <StatusDot status={a.status} />
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-800 truncate">{a.display_name}</span>
                  {a.id === me?.id && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">you</span>}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${a.role === 'admin' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'}`}>
                    {a.role}
                  </span>
                  <span className="text-xs text-slate-400 capitalize">{a.status}</span>
                </div>
              </div>
              {me?.role === 'admin' && a.id !== me?.id && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => changeRole(a.id, a.role === 'admin' ? 'agent' : 'admin')}
                    title={a.role === 'admin' ? 'Demote to agent' : 'Promote to admin'}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {a.role === 'admin' ? <User size={15} /> : <Shield size={15} />}
                  </button>
                  <button
                    onClick={() => deactivate(a.id)}
                    title="Remove agent"
                    className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
