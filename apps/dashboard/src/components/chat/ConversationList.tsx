import { useState } from 'react'
import { Search } from 'lucide-react'
import { useConversations } from '../../hooks/useConversations'
import { useChatStore } from '../../stores/chatStore'
import { ConversationItem } from './ConversationItem'
import { EmptyState } from '../shared/EmptyState'

const tabs = [
  { label: 'Waiting', status: 'waiting' },
  { label: 'Mine', status: 'active' },
  { label: 'All', status: undefined },
  { label: 'Resolved', status: 'resolved' },
]

export function ConversationList() {
  const [activeTab, setActiveTab] = useState(0)
  const [search, setSearch] = useState('')
  const { selectedConversationId, selectConversation } = useChatStore()
  const { conversations, loading } = useConversations(tabs[activeTab].status)

  const filtered = conversations.filter((c) => {
    if (!search) return true
    const name = c.visitors?.name ?? ''
    const email = c.visitors?.email ?? ''
    return name.toLowerCase().includes(search.toLowerCase()) ||
      email.toLowerCase().includes(search.toLowerCase())
  })

  return (
    <div className="w-72 border-r border-slate-200 flex flex-col bg-white flex-shrink-0">
      {/* Search */}
      <div className="p-3 border-b border-slate-100">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations…"
            className="w-full pl-8 pr-3 py-2 text-sm bg-slate-50 rounded-lg border border-slate-200 outline-none focus:border-brand-400 transition-colors"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100">
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            onClick={() => setActiveTab(i)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              activeTab === i
                ? 'text-brand-600 border-b-2 border-brand-500'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-sm text-slate-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon="📭" title="No conversations" description="They'll appear here when visitors start chatting." />
        ) : (
          filtered.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isSelected={conv.id === selectedConversationId}
              onClick={() => selectConversation(conv.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}
