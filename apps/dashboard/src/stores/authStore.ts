import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AgentProfile {
  id: string
  workspace_id: string
  display_name: string
  avatar_url: string | null
  role: string
  status: string
}

interface AuthStore {
  user: User | null
  agent: AgentProfile | null
  loading: boolean
  setUser: (user: User | null) => void
  setAgent: (agent: AgentProfile | null) => void
  setLoading: (loading: boolean) => void
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  agent: null,
  loading: true,
  setUser: (user) => set({ user }),
  setAgent: (agent) => set({ agent }),
  setLoading: (loading) => set({ loading }),
  logout: async () => {
    await supabase.auth.signOut()
    set({ user: null, agent: null })
  },
}))
