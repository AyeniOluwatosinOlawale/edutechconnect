import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleOptions, json, error } from '../_shared/cors.ts'
import { sendMessage } from '../_shared/telegram.ts'
import { updateLead } from '../_shared/zoho.ts'

const DASHBOARD_URL = Deno.env.get('DASHBOARD_URL') ?? 'https://edutechconnect-dashboard.vercel.app'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return error('Unauthorized', 401)

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: { user } } = await createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    ).auth.getUser()

    if (!user) return error('Unauthorized', 401)

    const { data: agent } = await supabase
      .from('agents')
      .select('id, workspace_id, display_name')
      .eq('id', user.id)
      .single()

    if (!agent) return error('Agent not found', 403)

    const { conversation_id } = await req.json()
    if (!conversation_id) return error('conversation_id required')

    // Fetch conversation + visitor
    const { data: conv } = await supabase
      .from('conversations')
      .select('id, workspace_id, status, zoho_lead_id, visitors(name, email, phone)')
      .eq('id', conversation_id)
      .single()

    if (!conv || conv.workspace_id !== agent.workspace_id) {
      return error('Conversation not found', 404)
    }

    const visitor = (conv as { visitors: { name: string | null; email: string | null; phone: string | null } }).visitors

    // Mark conversation escalated
    await supabase
      .from('conversations')
      .update({ status: 'escalated' })
      .eq('id', conversation_id)

    // Insert system message visible in chat
    await supabase.from('messages').insert({
      conversation_id,
      workspace_id: agent.workspace_id,
      sender_type: 'system',
      content: `${agent.display_name} escalated this conversation to Telegram.`,
    })

    // Send Telegram notification to configured chat
    const chatId = Deno.env.get('TELEGRAM_CHAT_ID')
    if (chatId) {
      const convUrl = `${DASHBOARD_URL}/inbox`
      const visitorName = visitor?.name ?? 'Anonymous visitor'

      await sendMessage(
        chatId,
        `🔔 <b>New chat needs attention</b>\n\n` +
        `👤 ${visitorName}\n\n` +
        `<a href="${convUrl}">Open in Dashboard →</a>`,
      )
    }

    // Update Zoho lead if linked
    if (conv.zoho_lead_id) {
      await updateLead(conv.zoho_lead_id, {
        Description: `Escalated to Telegram on ${new Date().toISOString()} by ${agent.display_name}`,
      }).catch(console.error)
    }

    return json({ success: true })
  } catch (e) {
    console.error('escalate error:', e)
    return error('Internal server error', 500)
  }
})
