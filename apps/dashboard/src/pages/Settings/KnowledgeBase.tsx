import { useEffect, useState, FormEvent, useRef } from 'react'
import mammoth from 'mammoth'
import { Plus, Trash2, RefreshCw, Globe, FileText, MessageSquare, HelpCircle, Sparkles } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { formatTime } from '../../lib/utils'

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1'

interface KbDoc {
  id: string
  source_type: 'faq' | 'pdf' | 'url' | 'transcript'
  title: string
  source_ref: string | null
  status: 'pending' | 'processing' | 'ready' | 'error'
  error_message: string | null
  chunk_count: number
  created_at: string
}

const statusStyles: Record<string, string> = {
  pending:    'bg-yellow-100 text-yellow-700',
  processing: 'bg-blue-100 text-blue-600',
  ready:      'bg-green-100 text-green-700',
  error:      'bg-red-100 text-red-600',
}

const sourceIcon: Record<string, React.ReactNode> = {
  faq:        <HelpCircle size={14} />,
  pdf:        <FileText size={14} />,
  url:        <Globe size={14} />,
  transcript: <MessageSquare size={14} />,
}

const DEFAULT_SYSTEM_PROMPT = `You are a helpful support assistant.
Answer the visitor's question using ONLY the context provided.
If the answer is not clearly in the context, say:
"I don't have that information — let me connect you with a human agent."
Keep answers concise (under 150 words). Be friendly and professional.`

interface AgentProfile { id: string; workspace_id: string; display_name: string; role: string; status: string }

export default function KnowledgeBase() {
  const { agent: storeAgent } = useAuthStore()
  const [agent, setLocalAgent] = useState<AgentProfile | null>(storeAgent)
  const [agentError, setAgentError] = useState<string | null>(null)
  const [docs, setDocs] = useState<KbDoc[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch agent directly if store didn't load it
  useEffect(() => {
    if (storeAgent) { setLocalAgent(storeAgent); return }
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) { setAgentError('Not logged in'); setLoading(false); return }
      const { data, error } = await supabase.from('agents').select('*').eq('id', session.user.id).single()
      console.log('[KnowledgeBase] agent query result:', { data, error, userId: session.user.id })
      if (error || !data) {
        setAgentError(`No agent profile found for user ${session.user.email} (id: ${session.user.id}). DB error: ${error?.message ?? 'no row returned'} (code: ${error?.code ?? 'none'})`)
        setLoading(false)
      } else {
        setLocalAgent(data as AgentProfile)
      }
    })
  }, [storeAgent])

  // AI settings
  const [aiEnabled, setAiEnabled] = useState(false)
  const [threshold, setThreshold] = useState(0.75)
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT)
  const [greetingMsg, setGreetingMsg] = useState('Hi! I\'m the AI assistant. How can I help you today?')
  const [autoIngest, setAutoIngest] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)

  // FAQ form
  const [faqQ, setFaqQ] = useState('')
  const [faqA, setFaqA] = useState('')
  const [addingFaq, setAddingFaq] = useState(false)

  // URL form
  const [urlInput, setUrlInput] = useState('')
  const [urlTitle, setUrlTitle] = useState('')
  const [addingUrl, setAddingUrl] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)

  // Multi-file upload
  interface FileItem {
    name: string
    status: 'queued' | 'extracting' | 'uploading' | 'done' | 'error'
    chunks?: number
    error?: string
  }
  const [fileItems, setFileItems] = useState<FileItem[]>([])
  const [isDragging, setIsDragging] = useState(false)

  async function getAuthHeader(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      // Token might have expired — try refreshing
      const { data: { session: fresh } } = await supabase.auth.refreshSession()
      return `Bearer ${fresh?.access_token ?? ''}`
    }
    return `Bearer ${session.access_token}`
  }

  useEffect(() => {
    if (!agent) return
    // Load workspace AI settings
    supabase.from('workspaces').select('settings').eq('id', agent.workspace_id).single()
      .then(({ data }) => {
        const s = (data?.settings ?? {}) as Record<string, unknown>
        setAiEnabled(s.ai_enabled === true)
        setThreshold((s.ai_confidence_threshold as number) ?? 0.75)
        setSystemPrompt((s.ai_system_prompt as string) ?? DEFAULT_SYSTEM_PROMPT)
        setGreetingMsg((s.ai_greeting_message as string) ?? greetingMsg)
        setAutoIngest(s.ai_auto_ingest_transcripts === true)
      })
    loadDocs()
  }, [agent])

  function loadDocs() {
    if (!agent) return
    supabase.from('kb_documents').select('*').eq('workspace_id', agent.workspace_id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setDocs((data as KbDoc[]) ?? [])
        setLoading(false)
      })
  }

  async function saveSettings(e: FormEvent) {
    e.preventDefault()
    if (!agent) return
    const { data: ws } = await supabase.from('workspaces').select('settings').eq('id', agent.workspace_id).single()
    const current = (ws?.settings ?? {}) as Record<string, unknown>
    await supabase.from('workspaces').update({
      settings: {
        ...current,
        ai_enabled: aiEnabled,
        ai_confidence_threshold: threshold,
        ai_system_prompt: systemPrompt,
        ai_greeting_message: greetingMsg,
        ai_auto_ingest_transcripts: autoIngest,
      },
    }).eq('id', agent.workspace_id)
    setSettingsSaved(true)
    setTimeout(() => setSettingsSaved(false), 2000)
  }

  async function addFaq(e: FormEvent) {
    e.preventDefault()
    if (!agent || !faqQ.trim() || !faqA.trim()) return
    setAddingFaq(true)
    try {
      const authHeader = await getAuthHeader()
      const res = await fetch(`${FUNCTIONS_URL}/kb-ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        body: JSON.stringify({
          workspace_id: agent.workspace_id,
          source_type: 'faq',
          title: faqQ,
          content: `Q: ${faqQ}\nA: ${faqA}`,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, unknown>
        console.error('[kb-ingest faq]', res.status, err)
        alert(`FAQ ingest failed (${res.status}): ${(err.error as string) ?? 'Unknown error'}`)
        return
      }
      setFaqQ('')
      setFaqA('')
      loadDocs()
    } finally {
      setAddingFaq(false)
    }
  }

  async function addUrl(e: FormEvent) {
    e.preventDefault()
    if (!agent || !urlInput.trim()) return
    setAddingUrl(true)
    try {
      const authHeader = await getAuthHeader()
      await fetch(`${FUNCTIONS_URL}/kb-crawl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        body: JSON.stringify({
          workspace_id: agent.workspace_id,
          url: urlInput,
          title: urlTitle || urlInput,
        }),
      })
      setUrlInput('')
      setUrlTitle('')
      loadDocs()
    } finally {
      setAddingUrl(false)
    }
  }

  function setFileStatus(name: string, patch: Partial<FileItem>) {
    setFileItems((prev) => prev.map((f) => f.name === name ? { ...f, ...patch } : f))
  }

  async function processFiles(files: File[]) {
    if (!agent) return
    const newItems: FileItem[] = files.map((f) => ({ name: f.name, status: 'queued' as const }))
    setFileItems((prev) => {
      const existing = new Set(prev.map((f) => f.name))
      return [...prev, ...newItems.filter((f) => !existing.has(f.name))]
    })

    const authHeader = await getAuthHeader()

    for (const file of files) {
      // Extract text
      setFileStatus(file.name, { status: 'extracting' })
      let text = ''
      try {
        if (file.name.endsWith('.docx')) {
          const buf = await file.arrayBuffer()
          const result = await mammoth.extractRawText({ arrayBuffer: buf })
          text = result.value
        } else {
          text = await file.text()
        }
      } catch {
        setFileStatus(file.name, { status: 'error', error: 'Failed to read file' })
        continue
      }

      // Ingest to vector DB
      setFileStatus(file.name, { status: 'uploading' })
      try {
        const res = await fetch(`${FUNCTIONS_URL}/kb-ingest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: authHeader },
          body: JSON.stringify({
            workspace_id: agent.workspace_id,
            source_type: 'pdf',
            title: file.name.replace(/\.[^.]+$/, ''),
            content: text,
          }),
        })
        let data: Record<string, unknown> = {}
        try { data = await res.json() } catch { /* non-JSON response */ }
        if (!res.ok) {
          const msg = (data.error as string) ?? `HTTP ${res.status}`
          console.error('[kb-ingest] failed', res.status, data)
          throw new Error(msg)
        }
        setFileStatus(file.name, { status: 'done', chunks: data.chunk_count as number })
      } catch (e) {
        setFileStatus(file.name, { status: 'error', error: e instanceof Error ? e.message : String(e) })
      }
    }
    loadDocs()
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length) processFiles(files)
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      /\.(docx|txt|md|csv|rtf)$/i.test(f.name)
    )
    if (files.length) processFiles(files)
  }

  async function deleteDoc(id: string) {
    await supabase.from('kb_documents').delete().eq('id', id)
    setDocs((prev) => prev.filter((d) => d.id !== id))
  }

  const faqDocs   = docs.filter((d) => d.source_type === 'faq')
  const pdfDocs   = docs.filter((d) => d.source_type === 'pdf')
  const urlDocs   = docs.filter((d) => d.source_type === 'url')
  const transDocs = docs.filter((d) => d.source_type === 'transcript')

  if (agentError) {
    return (
      <div className="max-w-xl">
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <p className="text-sm font-semibold text-red-700 mb-1">Agent profile not found</p>
          <p className="text-sm text-red-600 mb-3">{agentError}</p>
          <p className="text-xs text-slate-500 font-mono bg-white border border-slate-200 rounded p-3">
            INSERT INTO public.agents (id, workspace_id, display_name, role, status)<br/>
            SELECT u.id, '00000000-0000-0000-0000-000000000001',<br/>
            &nbsp;&nbsp;split_part(u.email,'@',1), 'owner', 'online'<br/>
            FROM auth.users u LEFT JOIN public.agents a ON a.id=u.id<br/>
            WHERE a.id IS NULL ON CONFLICT (id) DO NOTHING;
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-10">
      {/* ── AI Settings ── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={16} className="text-violet-500" />
          <h2 className="text-base font-semibold text-slate-800">AI Assistant Settings</h2>
        </div>

        <form onSubmit={saveSettings} className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          {/* Master toggle */}
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="text-sm font-medium text-slate-700">Enable AI-first mode</p>
              <p className="text-xs text-slate-400 mt-0.5">Bot auto-replies to visitors; agents can take over at any time</p>
            </div>
            <button
              type="button"
              onClick={() => setAiEnabled((v) => !v)}
              className={`relative w-11 h-6 rounded-full transition-colors ${aiEnabled ? 'bg-violet-500' : 'bg-slate-200'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${aiEnabled ? 'translate-x-5' : ''}`} />
            </button>
          </label>

          {/* Confidence threshold */}
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1.5">
              Confidence Threshold — <span className="text-violet-600 font-semibold">{(threshold * 100).toFixed(0)}%</span>
            </label>
            <input
              type="range" min={0.5} max={0.95} step={0.05}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-full accent-violet-500"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
              <span>50% — answers more, less certain</span>
              <span>95% — very conservative</span>
            </div>
          </div>

          {/* AI greeting */}
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1.5">AI Greeting Message</label>
            <input
              type="text"
              value={greetingMsg}
              onChange={(e) => setGreetingMsg(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400"
            />
          </div>

          {/* System prompt */}
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1.5">AI System Prompt</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={5}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 resize-none font-mono"
            />
          </div>

          {/* Auto-ingest transcripts */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={autoIngest} onChange={(e) => setAutoIngest(e.target.checked)} className="w-4 h-4 accent-violet-500" />
            <span className="text-sm text-slate-700">Automatically add resolved conversations to the knowledge base</span>
          </label>

          <button type="submit" className="bg-violet-500 hover:bg-violet-600 text-white rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors">
            {settingsSaved ? '✓ Saved' : 'Save AI Settings'}
          </button>
        </form>
      </section>

      {/* ── FAQ Entries ── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <HelpCircle size={15} className="text-slate-400" />
          <h2 className="text-base font-semibold text-slate-800">FAQ Entries</h2>
          <span className="text-xs text-slate-400 ml-auto">{faqDocs.length} entries</span>
        </div>

        <form onSubmit={addFaq} className="bg-white border border-slate-200 rounded-xl p-4 mb-4 space-y-3">
          <input
            value={faqQ}
            onChange={(e) => setFaqQ(e.target.value)}
            placeholder="Question"
            required
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-violet-400"
          />
          <textarea
            value={faqA}
            onChange={(e) => setFaqA(e.target.value)}
            placeholder="Answer"
            required
            rows={2}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-violet-400 resize-none"
          />
          <button type="submit" disabled={addingFaq} className="flex items-center gap-2 bg-violet-500 hover:bg-violet-600 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors disabled:opacity-60">
            <Plus size={14} /> {addingFaq ? 'Adding…' : 'Add FAQ'}
          </button>
        </form>

        <DocList docs={faqDocs} onDelete={deleteDoc} loading={loading} />
      </section>

      {/* ── URLs ── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Globe size={15} className="text-slate-400" />
          <h2 className="text-base font-semibold text-slate-800">Website URLs</h2>
          <span className="text-xs text-slate-400 ml-auto">{urlDocs.length} pages</span>
        </div>

        <form onSubmit={addUrl} className="bg-white border border-slate-200 rounded-xl p-4 mb-4 space-y-3">
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://edutechconnect.org/programs"
            type="url"
            required
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-violet-400"
          />
          <input
            value={urlTitle}
            onChange={(e) => setUrlTitle(e.target.value)}
            placeholder="Page title (optional)"
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-violet-400"
          />
          <button type="submit" disabled={addingUrl} className="flex items-center gap-2 bg-violet-500 hover:bg-violet-600 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors disabled:opacity-60">
            <Globe size={14} /> {addingUrl ? 'Crawling…' : 'Crawl & Add'}
          </button>
        </form>

        <DocList docs={urlDocs} onDelete={deleteDoc} loading={loading} />
      </section>

      {/* ── Documents ── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <FileText size={15} className="text-slate-400" />
          <h2 className="text-base font-semibold text-slate-800">Documents</h2>
          <span className="text-xs text-slate-400 ml-auto">{pdfDocs.length} docs</span>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`bg-white border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors mb-4 ${
            isDragging ? 'border-violet-400 bg-violet-50' : 'border-slate-200 hover:border-violet-300'
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".docx,.txt,.md,.csv,.rtf"
            multiple
            className="hidden"
            onChange={handleFileInput}
          />
          <FileText size={28} className="mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">Drop files here or <span className="text-violet-500">click to browse</span></p>
          <p className="text-xs text-slate-400 mt-1">Supports .docx, .txt, .md, .csv — multiple files at once</p>
        </div>

        {/* Per-file status list */}
        {fileItems.length > 0 && (
          <div className="flex flex-col gap-2 mb-4">
            {fileItems.map((f) => (
              <div key={f.name} className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <FileText size={14} className="text-slate-400 flex-shrink-0" />
                <span className="text-sm text-slate-700 flex-1 truncate">{f.name}</span>
                {f.status === 'queued' && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Queued</span>
                )}
                {f.status === 'extracting' && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse inline-block" />
                    Extracting text…
                  </span>
                )}
                {f.status === 'uploading' && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse inline-block" />
                    Converting to vectors…
                  </span>
                )}
                {f.status === 'done' && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 flex items-center gap-1">
                    ✓ Done — {f.chunks} chunks
                  </span>
                )}
                {f.status === 'error' && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 max-w-xs break-all" title={f.error}>
                    ✕ {f.error}
                  </span>
                )}
              </div>
            ))}
            {fileItems.some((f) => f.status === 'done' || f.status === 'error') && (
              <button
                onClick={() => setFileItems([])}
                className="text-xs text-slate-400 hover:text-slate-600 self-end mt-1"
              >
                Clear list
              </button>
            )}
          </div>
        )}

        <DocList docs={pdfDocs} onDelete={deleteDoc} loading={false} />
      </section>

      {/* ── Transcripts ── */}
      {transDocs.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare size={15} className="text-slate-400" />
            <h2 className="text-base font-semibold text-slate-800">Chat Transcripts</h2>
            <span className="text-xs text-slate-400 ml-auto">{transDocs.length} transcripts</span>
          </div>
          <DocList docs={transDocs} onDelete={deleteDoc} loading={false} />
        </section>
      )}
    </div>
  )
}

function DocList({ docs, onDelete, loading }: { docs: KbDoc[]; onDelete: (id: string) => void; loading: boolean }) {
  if (loading) return <p className="text-sm text-slate-400">Loading…</p>
  if (docs.length === 0) return <p className="text-sm text-slate-400">None added yet.</p>
  return (
    <div className="flex flex-col gap-2">
      {docs.map((doc) => (
        <div key={doc.id} className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <span className="text-slate-400 mt-0.5">{sourceIcon[doc.source_type]}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-700 truncate">{doc.title}</p>
            {doc.source_ref && (
              <p className="text-xs text-slate-400 truncate mt-0.5">{doc.source_ref}</p>
            )}
            <div className="flex items-center gap-3 mt-1.5">
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusStyles[doc.status]}`}>
                {doc.status === 'processing' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse mr-1" />}
                {doc.status}
              </span>
              {doc.status === 'ready' && (
                <span className="text-[10px] text-slate-400">{doc.chunk_count} chunk{doc.chunk_count !== 1 ? 's' : ''}</span>
              )}
              {doc.error_message && (
                <span className="text-[10px] text-red-500 truncate">{doc.error_message}</span>
              )}
              <span className="text-[10px] text-slate-300">{formatTime(doc.created_at)}</span>
            </div>
          </div>
          <button onClick={() => onDelete(doc.id)} className="text-slate-300 hover:text-red-400 transition-colors mt-0.5 flex-shrink-0">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
