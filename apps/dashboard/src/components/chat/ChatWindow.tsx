import { useEffect, useRef, useState, KeyboardEvent } from 'react'
import { Send, CheckCheck, MessageCircle, Sparkles, UserCheck, Tag as TagIcon, X, PhoneIncoming, RotateCcw, Clock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useMessages } from '../../hooks/useMessages'
import { useAuthStore } from '../../stores/authStore'
import { useChatStore } from '../../stores/chatStore'
import { MessageBubble } from './MessageBubble'
import { EmptyState } from '../shared/EmptyState'

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1'

interface CannedResponse { id: string; shortcut: string; title: string; content: string }
interface ConvTag { id: string; name: string; color: string }

export function ChatWindow() {
  const { selectedConversationId } = useChatStore()
  const { agent } = useAuthStore()
  const { messages, loading, isAgentTyping, addOptimistic } = useMessages(selectedConversationId)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [isAiActive, setIsAiActive] = useState(false)
  const [convSource, setConvSource] = useState<string | null>(null)
  const [convStatus, setConvStatus] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // Persistent broadcast channel — subscribed once per conversation, reused for every send
  const broadcastChanRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // Canned responses
  const [cannedResponses, setCannedResponses] = useState<CannedResponse[]>([])
  const [cannedQuery, setCannedQuery] = useState('')
  const [showCanned, setShowCanned] = useState(false)
  const [cannedIndex, setCannedIndex] = useState(0)

  // Tags
  const [allTags, setAllTags] = useState<ConvTag[]>([])
  const [convTags, setConvTags] = useState<ConvTag[]>([])
  const [showTagMenu, setShowTagMenu] = useState(false)
  const tagMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Load canned responses once
  useEffect(() => {
    if (!agent) return
    supabase.from('canned_responses').select('id, shortcut, title, content')
      .eq('workspace_id', agent.workspace_id).order('shortcut')
      .then(({ data }) => setCannedResponses((data as CannedResponse[]) ?? []))
  }, [agent])

  // Load all workspace tags once
  useEffect(() => {
    if (!agent) return
    supabase.from('tags').select('id, name, color').eq('workspace_id', agent.workspace_id)
      .order('name').then(({ data }) => setAllTags((data as ConvTag[]) ?? []))
  }, [agent])

  // Load tags for selected conversation
  useEffect(() => {
    if (!selectedConversationId) { setConvTags([]); return }
    supabase.from('conversation_tags').select('tags(id, name, color)')
      .eq('conversation_id', selectedConversationId)
      .then(({ data }) => {
        const tags = (data ?? []).flatMap((r: { tags: ConvTag | ConvTag[] | null }) =>
          Array.isArray(r.tags) ? r.tags : r.tags ? [r.tags] : []
        ) as ConvTag[]
        setConvTags(tags)
      })
  }, [selectedConversationId])

  // Close tag menu on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (tagMenuRef.current && !tagMenuRef.current.contains(e.target as Node)) {
        setShowTagMenu(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // Keep a persistent broadcast channel open so agent messages reach the widget instantly
  useEffect(() => {
    if (broadcastChanRef.current) {
      supabase.removeChannel(broadcastChanRef.current)
      broadcastChanRef.current = null
    }
    if (!selectedConversationId) return
    const ch = supabase.channel(`conversation:${selectedConversationId}`)
    ch.subscribe()
    broadcastChanRef.current = ch
    return () => {
      supabase.removeChannel(ch)
      broadcastChanRef.current = null
    }
  }, [selectedConversationId])

  // Fetch conversation source + status
  useEffect(() => {
    if (!selectedConversationId) { setConvSource(null); setConvStatus(null); return }
    supabase.from('conversations').select('source, status').eq('id', selectedConversationId).single()
      .then(({ data }) => {
        setConvSource(data?.source ?? 'widget')
        setConvStatus(data?.status ?? null)
      })

    // Subscribe to status changes
    const ch = supabase
      .channel(`conv-status:${selectedConversationId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversations',
        filter: `id=eq.${selectedConversationId}`,
      }, ({ new: row }) => {
        setConvStatus((row as { status: string }).status)
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [selectedConversationId])

  // Fetch AI state for selected conversation
  useEffect(() => {
    if (!selectedConversationId) { setIsAiActive(false); return }
    supabase
      .from('conversation_ai_state')
      .select('is_bot_active')
      .eq('conversation_id', selectedConversationId)
      .maybeSingle()
      .then(({ data }) => setIsAiActive(data?.is_bot_active ?? false))

    // Subscribe to AI state changes in real time
    const channel = supabase
      .channel(`ai-state:${selectedConversationId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversation_ai_state',
        filter: `conversation_id=eq.${selectedConversationId}`,
      }, ({ new: row }) => {
        setIsAiActive((row as { is_bot_active: boolean }).is_bot_active)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [selectedConversationId])

  const filteredCanned = cannedResponses.filter((c) =>
    c.shortcut.toLowerCase().includes(cannedQuery.toLowerCase()) ||
    c.title.toLowerCase().includes(cannedQuery.toLowerCase())
  )

  function handleTextChange(val: string) {
    setText(val)
    const slashMatch = val.match(/^\/(\S*)$/)
    if (slashMatch) {
      setCannedQuery(slashMatch[1])
      setShowCanned(true)
      setCannedIndex(0)
    } else {
      setShowCanned(false)
      setCannedQuery('')
    }
  }

  function applyCanned(item: CannedResponse) {
    setText(item.content)
    setShowCanned(false)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  async function toggleTag(tag: ConvTag) {
    if (!selectedConversationId) return
    const exists = convTags.some((t) => t.id === tag.id)
    if (exists) {
      await supabase.from('conversation_tags').delete()
        .eq('conversation_id', selectedConversationId).eq('tag_id', tag.id)
      setConvTags((prev) => prev.filter((t) => t.id !== tag.id))
    } else {
      await supabase.from('conversation_tags').insert({ conversation_id: selectedConversationId, tag_id: tag.id })
      setConvTags((prev) => [...prev, tag])
    }
  }

  if (!selectedConversationId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <EmptyState icon="👈" title="Select a conversation" description="Pick one from the list to start chatting." />
      </div>
    )
  }

  async function getAuthHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return `Bearer ${session?.access_token}`
  }

  async function sendMessage() {
    if (!text.trim() || !agent || !selectedConversationId) return
    setSending(true)
    const content = text.trim()
    setText('')

    const { data: inserted } = await supabase.from('messages').insert({
      conversation_id: selectedConversationId,
      workspace_id: agent.workspace_id,
      sender_type: 'agent',
      sender_id: agent.id,
      sender_name: agent.display_name,
      content_type: 'text',
      content,
    }).select('id, created_at, conversation_id, sender_id, sender_name, content_type, deleted_at').single()

    // Show message instantly — don't wait for Realtime echo
    if (inserted) {
      addOptimistic({
        ...inserted,
        sender_type: 'agent',
        content,
      })
    }

    await supabase
      .from('conversations')
      .update({ status: 'active', assigned_agent_id: agent.id, first_response_at: new Date().toISOString() })
      .eq('id', selectedConversationId)
      .eq('status', 'waiting')

    // Broadcast to widget via the persistent channel (already subscribed, fires instantly)
    if (inserted && broadcastChanRef.current) {
      broadcastChanRef.current.send({
        type: 'broadcast',
        event: 'new_message',
        payload: {
          id: inserted.id,
          conversation_id: selectedConversationId,
          sender_type: 'agent',
          sender_name: agent.display_name,
          content,
          created_at: inserted.created_at,
        },
      }).catch(console.error)
    }

    // Forward to Telegram — always check fresh from DB to avoid state race
    if (inserted) {
      supabase.from('conversations').select('source').eq('id', selectedConversationId).single()
        .then(({ data }) => {
          if (data?.source === 'telegram') {
            fetch(`${FUNCTIONS_URL}/telegram-forward`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
              },
              body: JSON.stringify({ conversation_id: selectedConversationId, content, agent_name: agent.display_name }),
            }).catch(console.error)
          }
        })
    }

    setSending(false)
  }

  async function pickUpConversation() {
    if (!selectedConversationId || !agent) return
    await supabase.from('conversations')
      .update({ status: 'active', assigned_agent_id: agent.id })
      .eq('id', selectedConversationId)
    setConvStatus('active')
  }

  async function setConversationWaiting() {
    if (!selectedConversationId) return
    await supabase.from('conversations')
      .update({ status: 'waiting', assigned_agent_id: null })
      .eq('id', selectedConversationId)
    setConvStatus('waiting')
  }

  async function handleTakeOver() {
    if (!selectedConversationId) return
    const authHeader = await getAuthHeader()
    await fetch(`${FUNCTIONS_URL}/ai-takeover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ conversation_id: selectedConversationId }),
    })
    setIsAiActive(false)
  }

  async function resolveConversation() {
    if (!selectedConversationId) return
    const authHeader = await getAuthHeader()
    await fetch(`${FUNCTIONS_URL}/conversation-resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ conversation_id: selectedConversationId }),
    })
    setConvStatus('resolved')
  }

  async function escalateToWhatsApp() {
    if (!selectedConversationId) return
    const authHeader = await getAuthHeader()
    await fetch(`${FUNCTIONS_URL}/escalate-whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ conversation_id: selectedConversationId }),
    })
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-white">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-white flex-wrap">
        {convSource === 'telegram' && (
          <span className="flex items-center gap-1.5 text-xs font-medium bg-sky-100 text-sky-700 px-2.5 py-1 rounded-lg flex-shrink-0">
            <MessageCircle size={11} /> Telegram
          </span>
        )}
        {isAiActive && (
          <span className="flex items-center gap-1.5 text-xs font-medium bg-violet-100 text-violet-700 px-2.5 py-1 rounded-lg">
            <Sparkles size={11} /> AI Active
          </span>
        )}
        {/* Conversation tags */}
        <div className="flex items-center gap-1 flex-1 flex-wrap">
          {convTags.map((t) => (
            <span
              key={t.id}
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full text-white font-medium cursor-pointer"
              style={{ background: t.color || '#6366f1' }}
              onClick={() => toggleTag(t)}
            >
              {t.name} <X size={10} />
            </span>
          ))}
          {allTags.length > 0 && (
            <div className="relative" ref={tagMenuRef}>
              <button
                onClick={() => setShowTagMenu((v) => !v)}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 px-1.5 py-0.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <TagIcon size={12} /> Tag
              </button>
              {showTagMenu && (
                <div className="absolute top-7 left-0 bg-white border border-slate-200 rounded-xl shadow-lg py-1 z-20 min-w-36">
                  {allTags.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => toggleTag(t)}
                      className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors ${convTags.some((ct) => ct.id === t.id) ? 'font-semibold' : ''}`}
                    >
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.color || '#6366f1' }} />
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {isAiActive && (
          <button
            onClick={handleTakeOver}
            className="flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:bg-violet-50 px-3 py-1.5 rounded-lg transition-colors"
          >
            <UserCheck size={14} /> Take Over
          </button>
        )}
        {/* Pick up — only for waiting conversations */}
        {convStatus === 'waiting' && (
          <button
            onClick={pickUpConversation}
            className="flex items-center gap-1.5 text-xs font-medium text-brand-600 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-lg transition-colors"
          >
            <PhoneIncoming size={14} /> Pick Up
          </button>
        )}
        {/* Resolve — for active conversations */}
        {convStatus !== 'resolved' && convStatus !== 'waiting' && (
          <button
            onClick={resolveConversation}
            className="flex items-center gap-1.5 text-xs font-medium text-green-600 hover:bg-green-50 px-3 py-1.5 rounded-lg transition-colors"
          >
            <CheckCheck size={14} /> Resolve
          </button>
        )}
        {/* Reopen — for resolved conversations */}
        {convStatus === 'resolved' && (
          <button
            onClick={setConversationWaiting}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 px-3 py-1.5 rounded-lg transition-colors"
          >
            <RotateCcw size={14} /> Reopen
          </button>
        )}
        {/* Set to waiting — for active conversations */}
        {convStatus === 'active' && (
          <button
            onClick={setConversationWaiting}
            className="flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:bg-amber-50 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Clock size={14} /> Set Waiting
          </button>
        )}
        <button
          onClick={escalateToWhatsApp}
          className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 px-3 py-1.5 rounded-lg transition-colors"
        >
          <MessageCircle size={14} /> Escalate
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {loading ? (
          <div className="text-sm text-slate-400 text-center pt-8">Loading messages…</div>
        ) : messages.length === 0 ? (
          <EmptyState icon="💬" title="No messages yet" description="The visitor hasn't sent anything yet." />
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
        {isAgentTyping && (
          <div className="flex items-center gap-1 text-xs text-slate-400">
            <span className="animate-bounce">●</span>
            <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>●</span>
            <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>●</span>
            <span className="ml-1">Visitor is typing</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-slate-100 p-3 flex items-end gap-2 relative">
        {/* Canned responses popup */}
        {showCanned && filteredCanned.length > 0 && (
          <div className="absolute bottom-full left-3 right-3 mb-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-20">
            <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100">
              Canned Responses — type more to filter
            </div>
            {filteredCanned.map((item, i) => (
              <button
                key={item.id}
                onMouseDown={() => applyCanned(item)}
                className={`flex items-start gap-3 w-full px-3 py-2 text-left hover:bg-slate-50 transition-colors ${i === cannedIndex ? 'bg-brand-50' : ''}`}
              >
                <span className="text-xs font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5">{item.shortcut}</span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-700 truncate">{item.title}</div>
                  <div className="text-xs text-slate-400 truncate">{item.content}</div>
                </div>
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (showCanned && filteredCanned.length > 0) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setCannedIndex((i) => Math.min(i + 1, filteredCanned.length - 1)); return }
              if (e.key === 'ArrowUp') { e.preventDefault(); setCannedIndex((i) => Math.max(i - 1, 0)); return }
              if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); applyCanned(filteredCanned[cannedIndex]); return }
              if (e.key === 'Escape') { setShowCanned(false); return }
            }
            onKeyDown(e as KeyboardEvent<HTMLTextAreaElement>)
          }}
          placeholder={isAiActive ? 'AI is handling this chat — type to override… (/ for canned)' : 'Type a message… (/ for canned responses)'}
          rows={1}
          className="flex-1 resize-none border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-400 transition-colors max-h-32 overflow-y-auto"
          style={{ height: 'auto' }}
          onInput={(e) => {
            const el = e.currentTarget
            el.style.height = 'auto'
            el.style.height = `${Math.min(el.scrollHeight, 128)}px`
          }}
        />
        <button
          onClick={sendMessage}
          disabled={!text.trim() || sending}
          className="w-10 h-10 rounded-xl bg-brand-500 text-white flex items-center justify-center disabled:opacity-40 hover:bg-brand-600 transition-colors flex-shrink-0"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}
