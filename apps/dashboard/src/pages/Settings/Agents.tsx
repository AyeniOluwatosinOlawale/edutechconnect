import { useEffect, useState, FormEvent } from 'react'
import { UserPlus, Trash2, Shield, User, CheckCircle, XCircle, Loader2 } from 'lucide-react'
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
}

interface InviteResult {
  email: string
  ok: boolean
  msg: string
}

function parseEmails(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes('@'))
}

export default function AgentsSettings() {
  const { agent: me } = useAuthStore()
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [emailsRaw, setEmailsRaw] = useState('')
  const [inviteRole, setInviteRole] = useState<'agent' | 'admin'>('agent')
  const [inviting, setInviting] = useState(false)
  const [results, setResults] = useState<InviteResult[]>([])

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

  async function deactivate(agentId: string, name: string) {
    if (!confirm(`Remove ${name} from the workspace?`)) return
    await supabase.from('agents').delete().eq('id', agentId)
    setAgents((prev) => prev.filter((a) => a.id !== agentId))
  }

  async function sendInvites(e: FormEvent) {
    e.preventDefault()
    const emails = parseEmails(emailsRaw)
    if (!emails.length || !me) return
    setInviting(true)
    setResults([])

    const { data: { session } } = await supabase.auth.getSession()

    const settled = await Promise.allSettled(
      emails.map(async (email) => {
        const res = await fetch(`${FUNCTIONS_URL}/invite-agent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ email, role: inviteRole }),
        })
        const body = await res.json()
        if (!res.ok) throw new Error(body.error ?? 'Failed')
        return email
      })
    )

    const newResults: InviteResult[] = settled.map((r, i) => ({
      email: emails[i],
      ok: r.status === 'fulfilled',
      msg: r.status === 'fulfilled' ? 'Invitation sent' : (r as PromiseRejectedResult).reason?.message ?? 'Failed',
    }))

    setResults(newResults)
    if (newResults.every((r) => r.ok)) setEmailsRaw('')
    setInviting(false)
  }

  const emailCount = parseEmails(emailsRaw).length

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-base font-semibold text-slate-800">Team Members</h2>

      {/* ── Invite form ── */}
      {me?.role === 'admin' && (
        <form onSubmit={sendInvites} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-1">Invite agents by email</p>
            <p className="text-xs text-slate-400">Enter one or more email addresses separated by commas, semicolons, or new lines.</p>
          </div>

          <textarea
            value={emailsRaw}
            onChange={(e) => setEmailsRaw(e.target.value)}
            placeholder={'john@example.com\njane@example.com, mark@example.com'}
            rows={4}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-400 resize-none font-mono"
          />

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-600">Role:</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'agent' | 'admin')}
                className="border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-brand-400"
              >
                <option value="agent">Agent</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={inviting || emailCount === 0}
              className="ml-auto flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
            >
              {inviting ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              {inviting ? 'Sending…' : `Invite ${emailCount > 0 ? `${emailCount} agent${emailCount > 1 ? 's' : ''}` : ''}`}
            </button>
          </div>

          {/* Per-email results */}
          {results.length > 0 && (
            <div className="space-y-1.5 pt-1 border-t border-slate-100">
              {results.map((r) => (
                <div key={r.email} className="flex items-center gap-2 text-xs">
                  {r.ok
                    ? <CheckCircle size={13} className="text-green-500 flex-shrink-0" />
                    : <XCircle size={13} className="text-red-400 flex-shrink-0" />}
                  <span className="font-mono text-slate-700">{r.email}</span>
                  <span className={`ml-auto ${r.ok ? 'text-green-600' : 'text-red-500'}`}>{r.msg}</span>
                </div>
              ))}
            </div>
          )}
        </form>
      )}

      {/* ── Agent list ── */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
          {agents.length} member{agents.length !== 1 ? 's' : ''}
        </p>
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
                    {a.id === me?.id && (
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">you</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${a.role === 'admin' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'}`}>
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
                      onClick={() => deactivate(a.id, a.display_name)}
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
    </div>
  )
}
