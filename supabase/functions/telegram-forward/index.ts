// Forwards an agent reply to the visitor's Telegram chat.
// Called from the dashboard when agent sends a message in a Telegram conversation.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleOptions, json, error } from '../_shared/cors.ts'
import { sendMessage } from '../_shared/telegram.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()

  try {
    const { conversation_id, content, agent_name } = await req.json()
    if (!conversation_id || !content) return error('Missing fields')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: conv } = await supabase
      .from('conversations')
      .select('telegram_chat_id')
      .eq('id', conversation_id)
      .single()

    if (!conv?.telegram_chat_id) return json({ skipped: true })

    const label = agent_name ? `👤 <b>${agent_name}</b>\n` : ''
    await sendMessage(conv.telegram_chat_id, `${label}${content}`)

    return json({ success: true })
  } catch (e) {
    console.error('[telegram-forward] error:', e)
    return error('Internal server error', 500)
  }
})
