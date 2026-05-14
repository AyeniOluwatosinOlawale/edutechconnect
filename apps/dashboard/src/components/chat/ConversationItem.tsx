import { memo } from 'react'
import { Sparkles, MessageCircle, Globe } from 'lucide-react'
import { type Conversation } from '../../hooks/useConversations'
import { Avatar } from '../shared/Avatar'
import { formatTime } from '../../lib/utils'
import { cn } from '../../lib/utils'

interface Props {
  conversation: Conversation
  isSelected: boolean
  onClick: () => void
}

const statusColors: Record<string, string> = {
  waiting:   'bg-yellow-400',
  active:    'bg-green-400',
  resolved:  'bg-slate-300',
  missed:    'bg-red-400',
  escalated: 'bg-purple-400',
}

export const ConversationItem = memo(function ConversationItem({ conversation, isSelected, onClick }: Props) {
  const visitorName = conversation.visitors?.name ?? 'Anonymous Visitor'

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-slate-50 transition-colors border-b border-slate-100',
        isSelected && 'bg-brand-50 border-l-2 border-l-brand-500',
      )}
    >
      <Avatar name={visitorName} size="md" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-slate-800 text-sm truncate">{visitorName}</span>
          <span className="ml-auto flex items-center gap-1 flex-shrink-0">
            {conversation.source === 'telegram' ? (
              <span title="Telegram conversation" className="flex items-center gap-0.5 text-[9px] bg-sky-100 text-sky-600 px-1.5 py-0.5 rounded font-medium">
                <MessageCircle size={8} /> TG
              </span>
            ) : (
              <span title="Widget conversation" className="flex items-center gap-0.5 text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">
                <Globe size={8} /> Web
              </span>
            )}
            {conversation.ai_handled && (
              <span title="AI-handled conversation" className="flex items-center gap-0.5 text-[9px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded font-medium">
                <Sparkles size={8} /> AI
              </span>
            )}
            <span className={`w-2 h-2 rounded-full ${statusColors[conversation.status] ?? 'bg-slate-300'}`} />
          </span>
        </div>
        {conversation.visitors?.email && (
          <p className="text-xs text-slate-400 truncate">{conversation.visitors.email}</p>
        )}
        <p className="text-xs text-slate-400 mt-0.5">{formatTime(conversation.started_at)}</p>
      </div>
    </button>
  )
})
