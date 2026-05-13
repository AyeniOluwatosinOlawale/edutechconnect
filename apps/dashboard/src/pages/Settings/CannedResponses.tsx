import { useEffect, useState, FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'

interface Canned {
  id: string
  shortcut: string
  title: string
  content: string
}

export default function CannedResponses() {
  const { agent } = useAuthStore()
  const [items, setItems] = useState<Canned[]>([])
  const [form, setForm] = useState({ shortcut: '', title: '', content: '' })

  useEffect(() => {
    if (!agent) return
    supabase.from('canned_responses').select('*').eq('workspace_id', agent.workspace_id)
      .order('shortcut').then(({ data }) => setItems((data as Canned[]) ?? []))
  }, [agent])

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!agent) return
    const { data } = await supabase.from('canned_responses')
      .insert({ workspace_id: agent.workspace_id, created_by: agent.id, ...form })
      .select('*').single()
    if (data) { setItems((prev) => [...prev, data as Canned]); setForm({ shortcut: '', title: '', content: '' }) }
  }

  async function remove(id: string) {
    await supabase.from('canned_responses').delete().eq('id', id)
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-base font-semibold text-slate-800 mb-6">Canned Responses</h2>

      <form onSubmit={add} className="bg-white border border-slate-200 rounded-xl p-4 mb-6 flex flex-col gap-3">
        <div className="flex gap-3">
          <input
            value={form.shortcut}
            onChange={(e) => setForm((f) => ({ ...f, shortcut: e.target.value }))}
            placeholder="Shortcut (e.g. /thanks)"
            required
            className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-400"
          />
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Title"
            required
            className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-400"
          />
        </div>
        <textarea
          value={form.content}
          onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
          placeholder="Response content…"
          required
          rows={2}
          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-400 resize-none"
        />
        <button type="submit" className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors w-fit">
          <Plus size={14} /> Add Response
        </button>
      </form>

      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <div key={item.id} className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{item.shortcut}</span>
                <span className="text-sm font-medium text-slate-700">{item.title}</span>
              </div>
              <p className="text-xs text-slate-500 line-clamp-2">{item.content}</p>
            </div>
            <button onClick={() => remove(item.id)} className="text-slate-300 hover:text-red-400 transition-colors mt-0.5">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-slate-400">No canned responses yet.</p>}
      </div>
    </div>
  )
}
