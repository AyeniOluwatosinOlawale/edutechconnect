import { useEffect, useState, FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'

interface TagRow { id: string; name: string; color: string }

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#64748b',
]

export default function TagsSettings() {
  const { agent } = useAuthStore()
  const [tags, setTags] = useState<TagRow[]>([])
  const [name, setName] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[0])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!agent) return
    supabase.from('tags').select('id, name, color')
      .eq('workspace_id', agent.workspace_id).order('name')
      .then(({ data }) => setTags((data as TagRow[]) ?? []))
  }, [agent])

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!agent || !name.trim()) return
    setSaving(true)
    const { data } = await supabase.from('tags')
      .insert({ workspace_id: agent.workspace_id, name: name.trim(), color })
      .select('id, name, color').single()
    if (data) {
      setTags((prev) => [...prev, data as TagRow].sort((a, b) => a.name.localeCompare(b.name)))
      setName('')
      setColor(PRESET_COLORS[0])
    }
    setSaving(false)
  }

  async function remove(id: string) {
    await supabase.from('tags').delete().eq('id', id)
    setTags((prev) => prev.filter((t) => t.id !== id))
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-base font-semibold text-slate-800 mb-1">Conversation Tags</h2>
      <p className="text-sm text-slate-500 mb-6">Tags help you categorise conversations. Agents can apply them from the chat window.</p>

      <form onSubmit={add} className="bg-white border border-slate-200 rounded-xl p-4 mb-6 flex flex-col gap-4">
        <div className="flex gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tag name (e.g. Enrollment, Urgent)"
            required
            className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-400"
          />
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
          >
            <Plus size={14} /> Add
          </button>
        </div>

        {/* Color picker */}
        <div>
          <p className="text-xs text-slate-500 mb-2">Color</p>
          <div className="flex items-center gap-2 flex-wrap">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-offset-1 ring-slate-400' : 'hover:scale-110'}`}
                style={{ background: c }}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              title="Custom color"
              className="w-6 h-6 rounded-full cursor-pointer border-0 p-0 bg-transparent"
            />
          </div>
        </div>

        {/* Preview */}
        {name && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Preview:</span>
            <span
              className="text-xs px-2 py-0.5 rounded-full text-white font-medium"
              style={{ background: color }}
            >
              {name}
            </span>
          </div>
        )}
      </form>

      <div className="flex flex-col gap-2">
        {tags.map((tag) => (
          <div key={tag.id} className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ background: tag.color }}
            />
            <span className="flex-1 text-sm font-medium text-slate-700">{tag.name}</span>
            <span
              className="text-xs px-2 py-0.5 rounded-full text-white font-medium"
              style={{ background: tag.color }}
            >
              {tag.name}
            </span>
            <button
              onClick={() => remove(tag.id)}
              className="text-slate-300 hover:text-red-400 transition-colors ml-1"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        {tags.length === 0 && <p className="text-sm text-slate-400">No tags yet. Create one above.</p>}
      </div>
    </div>
  )
}
