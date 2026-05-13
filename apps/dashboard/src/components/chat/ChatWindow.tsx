import { useEffect, useRef, useState, KeyboardEvent } from 'react'
import { Send, CheckCheck, PhoneCall, Sparkles, UserCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useMessages } from '../../hooks/useMessages'
import { useAuthStore } from '../../stores/authStore'
import { useChatStore } from '../../stores/chatStore'
import { MessageBubble } from './MessageBubble'
import { EmptyState } from '../shared/EmptyState'

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1'

export function ChatWindow() {
  const { selectedConversationId } = useChatStore()
  const { agent } = useAuthStore()
  const { messages, loading, isAgentTyping } = useMessages(selectedConversationId)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [isAiActive, setIsAiActive] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
    }).select('id, created_at').single()

    await supabase
      .from('conversations')
      .update({ status: 'active', assigned_agent_id: agent.id, first_response_at: new Date().toISOString() })
      .eq('id', selectedConversationId)
      .eq('status', 'waiting')

    // Broadcast to widget via Realtime broadcast (bypasses RLS for anon visitor)
    if (inserted) {
      const channel = supabase.channel(`conversation:${selectedConversationId}`)
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.send({
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
          }).finally(() => supabase.removeChannel(channel))
        }
      })
    }

    setSending(false)
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
        {isAiActive && (
          <span className="flex items-center gap-1.5 text-xs font-medium bg-violet-100 text-violet-700 px-2.5 py-1 rounded-lg">
            <Sparkles size={11} /> AI Active
          </span>
        )}
        <span className="text-sm font-medium text-slate-700 flex-1" />
        {isAiActive && (
          <button
            onClick={handleTakeOver}
            className="flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:bg-violet-50 px-3 py-1.5 rounded-lg transition-colors"
          >
            <UserCheck size={14} /> Take Over
          </button>
        )}
        <button
          onClick={resolveConversation}
          className="flex items-center gap-1.5 text-xs font-medium text-green-600 hover:bg-green-50 px-3 py-1.5 rounded-lg transition-colors"
        >
          <CheckCheck size={14} /> Resolve
        </button>
        <button
          onClick={escalateToWhatsApp}
          className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 px-3 py-1.5 rounded-lg transition-colors"
        >
          <PhoneCall size={14} /> Escalate WA
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
      <div className="border-t border-slate-100 p-3 flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={isAiActive ? 'AI is handling this chat — type to override…' : 'Type a message… (Enter to send)'}
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
