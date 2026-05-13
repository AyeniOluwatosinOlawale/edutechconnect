import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

export interface OnlineAgent {
  agent_id: string
  display_name: string
  status: string
}

export function useAgentPresence() {
  const { agent } = useAuthStore()
  const [onlineAgents, setOnlineAgents] = useState<OnlineAgent[]>([])

  useEffect(() => {
    if (!agent) return

    const channel = supabase.channel(`presence:workspace:${agent.workspace_id}`, {
      config: { presence: { key: agent.id } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<OnlineAgent>()
        const agents = Object.values(state).flat()
        setOnlineAgents(agents)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            agent_id: agent.id,
            display_name: agent.display_name,
            status: agent.status,
          })
        }
      })

    return () => { supabase.removeChannel(channel) }
  }, [agent])

  return { onlineAgents }
}
