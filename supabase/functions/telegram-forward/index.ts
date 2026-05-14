// Called by the dashboard when an agent sends a message on a Telegram conversation.
// Forwards the reply to the visitor's Telegram chat.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleOptions, json, error } from '../_shared/cors.ts'
import { sendMessage } from '../_shared/telegram.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return error('Unauthorized', 401)

  try {
    const { data: { user } } = await createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    ).auth.getUser()

    if (!user) return error('Unauthorized', 401)

    const { conversation_id, content, agent_name } = await req.json()
    if (!conversation_id || !content) return error('conversation_id and content required')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Get telegram_chat_id for this conversation
    const { data: conv } = await supabase
      .from('conversations')
      .select('telegram_chat_id')
      .eq('id', conversation_id)
      .single()

    if (!conv?.telegram_chat_id) {
      return json({ skipped: true }) // Not a Telegram conversation
    }

    const agentLabel = agent_name ? `👤 <b>${agent_name}</b>\n` : ''
    await sendMessage(conv.telegram_chat_id, `${agentLabel}${content}`)

    return json({ success: true })
  } catch (e) {
    console.error('[telegram-forward] error:', e)
    return error('Internal server error', 500)
  }
})
