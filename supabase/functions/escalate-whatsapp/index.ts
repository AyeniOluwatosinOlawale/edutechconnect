import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleOptions, json, error } from '../_shared/cors.ts'
import { sendTemplate } from '../_shared/whatsapp.ts'
import { updateLead } from '../_shared/zoho.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()

  // Requires agent JWT
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

    const { conversation_id } = await req.json()
    if (!conversation_id) return error('conversation_id required')

    // Fetch conversation + visitor
    const { data: conv } = await supabase
      .from('conversations')
      .select('id, workspace_id, visitor_id, status, zoho_lead_id, visitors(name, whatsapp_number, email)')
      .eq('id', conversation_id)
      .single()

    if (!conv) return error('Conversation not found', 404)

    const visitor = (conv as { visitors: { name: string | null; whatsapp_number: string | null; email: string | null } }).visitors

    if (!visitor?.whatsapp_number) {
      return error('Visitor has no WhatsApp number on record', 422)
    }

    // Send WhatsApp template message
    await sendTemplate(visitor.whatsapp_number, 'chat_escalation', [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: visitor.name ?? 'there' },
        ],
      },
    ])

    // Mark conversation as escalated
    await supabase
      .from('conversations')
      .update({ status: 'escalated' })
      .eq('id', conversation_id)

    // Update Zoho lead if linked
    if (conv.zoho_lead_id) {
      await updateLead(conv.zoho_lead_id, {
        Description: `Escalated to WhatsApp on ${new Date().toISOString()}`,
      })
    }

    return json({ success: true })
  } catch (e) {
    console.error('escalate-whatsapp error:', e)
    return error('Internal server error', 500)
  }
})
