import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { playNewMessage } from '../lib/sound'

export interface Message {
  id: string
  conversation_id: string
  sender_type: 'visitor' | 'agent' | 'system' | 'bot'
  sender_id: string | null
  sender_name: string | null
  content: string | null
  content_type: string
  created_at: string
  deleted_at: string | null
}

export function useMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [isAgentTyping, setIsAgentTyping] = useState(false)
  const seenIds = useRef(new Set<string>())

  useEffect(() => {
    if (!conversationId) {
      setMessages([])
      return
    }

    setLoading(true)
    seenIds.current.clear()

    supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        const msgs = (data as Message[]) ?? []
        msgs.forEach((m) => seenIds.current.add(m.id))
        setMessages(msgs)
        setLoading(false)
      })

    const channel = supabase
      .channel(`conversation:${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, ({ new: msg }) => {
        const m = msg as Message
        if (seenIds.current.has(m.id)) return
        seenIds.current.add(m.id)
        setMessages((prev) => [...prev, m])
        if (m.sender_type === 'visitor') playNewMessage()
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload?.sender_type === 'visitor') {
          setIsAgentTyping(payload?.is_typing ?? false)
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      setIsAgentTyping(false)
    }
  }, [conversationId])

  return { messages, loading, isAgentTyping }
}
