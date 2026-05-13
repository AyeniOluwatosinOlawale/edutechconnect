import { useState, useEffect, FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'

interface WidgetSettingsData {
  brand_color: string
  greeting_text: string
  offline_message: string
  widget_position: 'bottom-right' | 'bottom-left'
  show_agent_names: boolean
}

const defaults: WidgetSettingsData = {
  brand_color: '#6366f1',
  greeting_text: 'Hi there! How can we help you today?',
  offline_message: 'We are offline. Leave a message and we\'ll get back to you!',
  widget_position: 'bottom-right',
  show_agent_names: true,
}

export default function WidgetSettings() {
  const { agent } = useAuthStore()
  const [form, setForm] = useState<WidgetSettingsData>(defaults)
  const [saved, setSaved] = useState(false)
  const [widgetKey, setWidgetKey] = useState('')

  useEffect(() => {
    if (!agent) return
    supabase
      .from('workspaces')
      .select('settings, widget_key')
      .eq('id', agent.workspace_id)
      .single()
      .then(({ data }) => {
        if (data) {
          setForm({ ...defaults, ...(data.settings as Partial<WidgetSettingsData>) })
          setWidgetKey(data.widget_key)
        }
      })
  }, [agent])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!agent) return
    await supabase
      .from('workspaces')
      .update({ settings: form })
      .eq('id', agent.workspace_id)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const snippetUrl = `${import.meta.env.VITE_WIDGET_CDN_URL ?? 'https://chat.edutechconnect.org'}/widget.js`
  const snippet = `<script>
  window.EduChatConfig = { workspaceKey: "${widgetKey}" };
</script>
<script async src="${snippetUrl}"></script>`

  return (
    <div className="max-w-2xl">
      <h2 className="text-base font-semibold text-slate-800 mb-6">Widget Customization</h2>

      {/* Install snippet */}
      <div className="bg-slate-900 rounded-xl p-4 mb-8">
        <p className="text-xs text-slate-400 mb-2 font-medium">Paste before &lt;/body&gt; on your website</p>
        <pre className="text-xs text-green-400 overflow-x-auto whitespace-pre-wrap">{snippet}</pre>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1.5">Brand Color</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={form.brand_color}
              onChange={(e) => setForm((f) => ({ ...f, brand_color: e.target.value }))}
              className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer"
            />
            <input
              type="text"
              value={form.brand_color}
              onChange={(e) => setForm((f) => ({ ...f, brand_color: e.target.value }))}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-400 w-32"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1.5">Greeting Text</label>
          <input
            type="text"
            value={form.greeting_text}
            onChange={(e) => setForm((f) => ({ ...f, greeting_text: e.target.value }))}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-400"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1.5">Offline Message</label>
          <textarea
            value={form.offline_message}
            onChange={(e) => setForm((f) => ({ ...f, offline_message: e.target.value }))}
            rows={2}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-400 resize-none"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1.5">Widget Position</label>
          <select
            value={form.widget_position}
            onChange={(e) => setForm((f) => ({ ...f, widget_position: e.target.value as 'bottom-right' | 'bottom-left' }))}
            className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-400"
          >
            <option value="bottom-right">Bottom Right</option>
            <option value="bottom-left">Bottom Left</option>
          </select>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.show_agent_names}
            onChange={(e) => setForm((f) => ({ ...f, show_agent_names: e.target.checked }))}
            className="w-4 h-4 accent-brand-500"
          />
          <span className="text-sm text-slate-700">Show agent names in chat</span>
        </label>

        <div>
          <button
            type="submit"
            className="bg-brand-500 hover:bg-brand-600 text-white rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors"
          >
            {saved ? '✓ Saved' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
