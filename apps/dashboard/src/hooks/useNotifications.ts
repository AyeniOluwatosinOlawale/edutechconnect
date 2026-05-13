import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

export interface Notification {
  id: string
  type: string
  message: string
  conversation_id: string | null
  read_at: string | null
  created_at: string
}

export function useNotifications() {
  const { agent } = useAuthStore()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const unreadCount = notifications.filter((n) => !n.read_at).length

  useEffect(() => {
    if (!agent) return

    supabase
      .from('notifications')
      .select('*')
      .eq('agent_id', agent.id)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setNotifications((data as Notification[]) ?? []))

    const channel = supabase
      .channel(`notifications:${agent.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `agent_id=eq.${agent.id}`,
      }, ({ new: n }) => {
        setNotifications((prev) => [n as Notification, ...prev])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [agent])

  async function markAllRead() {
    if (!agent) return
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('agent_id', agent.id)
      .is('read_at', null)
    setNotifications([])
  }

  return { notifications, unreadCount, markAllRead }
}
