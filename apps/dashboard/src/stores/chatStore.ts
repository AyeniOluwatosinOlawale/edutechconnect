import { create } from 'zustand'

interface ChatStore {
  selectedConversationId: string | null
  draftMessages: Map<string, string>
  selectConversation: (id: string | null) => void
  setDraft: (conversationId: string, text: string) => void
  getDraft: (conversationId: string) => string
}

export const useChatStore = create<ChatStore>((set, get) => ({
  selectedConversationId: null,
  draftMessages: new Map(),
  selectConversation: (id) => set({ selectedConversationId: id }),
  setDraft: (conversationId, text) => {
    const drafts = new Map(get().draftMessages)
    drafts.set(conversationId, text)
    set({ draftMessages: drafts })
  },
  getDraft: (conversationId) => get().draftMessages.get(conversationId) ?? '',
}))
