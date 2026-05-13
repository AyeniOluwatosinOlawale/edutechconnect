import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { playNewConversation } from '../lib/sound'

export interface Conversation {
  id: string
  status: string
  started_at: string
  visitor_id: string
  assigned_agent_id: string | null
  ai_handled: boolean
  ai_reply_count: number
  visitors: { name: string | null; email: string | null } | null
  agents: { display_name: string } | null
  last_message?: string
  last_message_at?: string
}

export function useConversations(status?: string) {
  const { agent } = useAuthStore()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const knownIds = useRef(new Set<string>())
  const initialized = useRef(false)

  const fetch = useCallback(async () => {
    if (!agent) return
    let query = supabase
      .from('conversations')
      .select(`
        id, status, started_at, visitor_id, assigned_agent_id, ai_handled, ai_reply_count,
        visitors(name, email),
        agents:assigned_agent_id(display_name)
      `)
      .eq('workspace_id', agent.workspace_id)
      .order('created_at', { ascending: false })
      .limit(100)

    if (status) query = query.eq('status', status)

    const { data } = await query
    const list = (data as unknown as Conversation[]) ?? []

    if (initialized.current) {
      // Detect genuinely new waiting conversations and alert
      list.forEach((c) => {
        if (!knownIds.current.has(c.id) && c.status === 'waiting') {
          playNewConversation()
        }
      })
    }

    list.forEach((c) => knownIds.current.add(c.id))
    initialized.current = true

    setConversations(list)
    setLoading(false)
  }, [agent, status])

  useEffect(() => {
    fetch()

    if (!agent) return
    const channel = supabase
      .channel(`workspace:${agent.workspace_id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'conversations',
        filter: `workspace_id=eq.${agent.workspace_id}`,
      }, () => fetch())
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversations',
        filter: `workspace_id=eq.${agent.workspace_id}`,
      }, () => fetch())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [agent, fetch])

  return { conversations, loading, refetch: fetch }
}
