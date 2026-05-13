import { memo } from 'react'
import { Sparkles } from 'lucide-react'
import { type Message } from '../../hooks/useMessages'
import { formatTime } from '../../lib/utils'
import { cn } from '../../lib/utils'

interface Props { message: Message }

export const MessageBubble = memo(function MessageBubble({ message: m }: Props) {
  if (m.sender_type === 'system') {
    return (
      <div className="flex justify-center my-1">
        <span className="text-xs text-slate-400 bg-slate-50 px-3 py-1 rounded-full border border-slate-100">{m.content}</span>
      </div>
    )
  }

  const isAgent = m.sender_type === 'agent'
  const isBot   = m.sender_type === 'bot'

  if (isBot) {
    return (
      <div className="flex flex-col gap-1 items-start">
        <span className="text-xs text-violet-500 ml-1 flex items-center gap-1 font-medium">
          <Sparkles size={10} /> AI Assistant
        </span>
        <div className="max-w-xs lg:max-w-sm px-4 py-2.5 rounded-2xl rounded-bl-sm text-sm leading-relaxed break-words bg-violet-50 text-violet-900 border border-violet-100">
          {m.content}
        </div>
        <span className="text-[10px] text-slate-400 mx-1">{formatTime(m.created_at)}</span>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col gap-1', isAgent ? 'items-start' : 'items-end')}>
      {isAgent && m.sender_name && (
        <span className="text-xs text-slate-400 ml-1">{m.sender_name}</span>
      )}
      <div
        className={cn(
          'max-w-xs lg:max-w-sm px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words',
          isAgent
            ? 'bg-slate-100 text-slate-800 rounded-bl-sm'
            : 'bg-brand-500 text-white rounded-br-sm',
        )}
      >
        {m.content}
      </div>
      <span className="text-[10px] text-slate-400 mx-1">{formatTime(m.created_at)}</span>
    </div>
  )
})
