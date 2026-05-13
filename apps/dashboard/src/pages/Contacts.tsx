import { useEffect, useState } from 'react'
import { Search, ExternalLink } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { formatTime } from '../lib/utils'

interface Contact {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  country_code: string | null
  device_type: string | null
  zoho_lead_id: string | null
  created_at: string
}

export default function Contacts() {
  const { agent } = useAuthStore()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!agent) return
    supabase
      .from('visitors')
      .select('id, name, email, phone, country_code, device_type, zoho_lead_id, created_at')
      .eq('workspace_id', agent.workspace_id)
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data }) => setContacts((data as Contact[]) ?? []))
  }, [agent])

  const filtered = contacts.filter((c) => {
    if (!search) return true
    return [c.name, c.email, c.phone].some((v) => v?.toLowerCase().includes(search.toLowerCase()))
  })

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Contacts</h1>
          <p className="text-sm text-slate-400">{contacts.length} visitors</p>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone…"
            className="pl-8 pr-4 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-brand-400 transition-colors"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              {['Name', 'Email', 'Phone', 'Country', 'First Seen', 'CRM'].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-700">{c.name ?? 'Anonymous'}</td>
                <td className="px-4 py-3 text-slate-500">{c.email ?? '—'}</td>
                <td className="px-4 py-3 text-slate-500">{c.phone ?? '—'}</td>
                <td className="px-4 py-3 text-slate-500">{c.country_code ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-400">{formatTime(c.created_at)}</td>
                <td className="px-4 py-3">
                  {c.zoho_lead_id ? (
                    <a
                      href={`https://crm.zoho.com/crm/org/leads/${c.zoho_lead_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-brand-500 hover:underline"
                    >
                      <ExternalLink size={11} /> Zoho
                    </a>
                  ) : (
                    <span className="text-xs text-slate-300">—</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">No contacts found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
