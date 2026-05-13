import { useEffect, useState } from 'react'
import { Monitor, Smartphone, Globe, Mail, Phone, Sparkles } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useChatStore } from '../../stores/chatStore'

interface RagChunk {
  id: string
  content: string
  similarity: number
  kb_documents: { title: string } | null
}

interface Visitor {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  country_code: string | null
  city: string | null
  browser: string | null
  os: string | null
  device_type: string | null
  current_url: string | null
  zoho_lead_id: string | null
}

export function VisitorInfoPanel() {
  const { selectedConversationId } = useChatStore()
  const [visitor, setVisitor] = useState<Visitor | null>(null)
  const [ragChunks, setRagChunks] = useState<RagChunk[]>([])

  useEffect(() => {
    if (!selectedConversationId) { setVisitor(null); setRagChunks([]); return }
    supabase
      .from('conversations')
      .select('visitors(id,name,email,phone,country_code,city,browser,os,device_type,current_url,zoho_lead_id)')
      .eq('id', selectedConversationId)
      .single()
      .then(({ data }) => {
        setVisitor((data as { visitors: Visitor } | null)?.visitors ?? null)
      })

    // Load the last RAG context used for this conversation
    supabase
      .from('conversation_ai_state')
      .select('last_chunk_ids, last_top_score')
      .eq('conversation_id', selectedConversationId)
      .maybeSingle()
      .then(async ({ data: aiState }) => {
        if (!aiState?.last_chunk_ids?.length) { setRagChunks([]); return }
        const { data: chunks } = await supabase
          .from('kb_chunks')
          .select('id, content, kb_documents(title)')
          .in('id', aiState.last_chunk_ids)
        setRagChunks((chunks as unknown as RagChunk[]) ?? [])
      })
  }, [selectedConversationId])

  if (!visitor) {
    return (
      <div className="w-64 border-l border-slate-200 bg-white flex-shrink-0 p-4 text-sm text-slate-400">
        {selectedConversationId ? 'Loading visitor info…' : 'Select a conversation'}
      </div>
    )
  }

  const DeviceIcon = visitor.device_type === 'mobile' ? Smartphone : Monitor

  return (
    <aside className="w-64 border-l border-slate-200 bg-white flex-shrink-0 overflow-y-auto">
      <div className="p-4 border-b border-slate-100">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Visitor</h3>
        <p className="font-semibold text-slate-800">{visitor.name ?? 'Anonymous'}</p>
        {visitor.email && (
          <a href={`mailto:${visitor.email}`} className="flex items-center gap-1.5 text-xs text-brand-500 mt-1 hover:underline">
            <Mail size={11} /> {visitor.email}
          </a>
        )}
        {visitor.phone && (
          <p className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
            <Phone size={11} /> {visitor.phone}
          </p>
        )}
      </div>

      <div className="p-4 border-b border-slate-100">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Location & Device</h3>
        {(visitor.city || visitor.country_code) && (
          <p className="flex items-center gap-1.5 text-xs text-slate-600 mb-1">
            <Globe size={11} /> {[visitor.city, visitor.country_code].filter(Boolean).join(', ')}
          </p>
        )}
        <p className="flex items-center gap-1.5 text-xs text-slate-600 mb-1">
          <DeviceIcon size={11} /> {visitor.device_type ?? 'Unknown device'}
        </p>
        {(visitor.browser || visitor.os) && (
          <p className="text-xs text-slate-500">{[visitor.browser, visitor.os].filter(Boolean).join(' · ')}</p>
        )}
      </div>

      {visitor.current_url && (
        <div className="p-4 border-b border-slate-100">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Current Page</h3>
          <p className="text-xs text-slate-600 break-all leading-relaxed">{visitor.current_url}</p>
        </div>
      )}

      {visitor.zoho_lead_id && (
        <div className="p-4 border-b border-slate-100">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">CRM</h3>
          <a
            href={`https://crm.zoho.com/crm/org/leads/${visitor.zoho_lead_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-brand-500 hover:underline"
          >
            View Zoho Lead →
          </a>
        </div>
      )}

      {ragChunks.length > 0 && (
        <div className="p-4">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Sparkles size={10} /> AI Context Used
          </h3>
          {ragChunks.map((chunk) => (
            <div key={chunk.id} className="text-xs text-slate-600 mb-2 p-2 bg-violet-50 rounded-lg border border-violet-100">
              <p className="font-medium text-violet-700 truncate">{chunk.kb_documents?.title ?? 'Unknown source'}</p>
              <p className="text-slate-500 line-clamp-2 mt-0.5">{chunk.content}</p>
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}
