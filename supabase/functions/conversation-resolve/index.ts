import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleOptions, json, error } from '../_shared/cors.ts'
import { sendEmail, csatEmailHtml } from '../_shared/email.ts'
import { updateLead } from '../_shared/zoho.ts'

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

    const { conversation_id } = await req.json()
    if (!conversation_id) return error('conversation_id required')

    const { data: conv } = await supabase
      .from('conversations')
      .select('id, workspace_id, status, zoho_lead_id, visitors(id, name, email)')
      .eq('id', conversation_id)
      .single()

    if (!conv) return error('Conversation not found', 404)
    if (conv.status === 'resolved') return json({ already_resolved: true })

    const visitor = (conv as { visitors: { id: string; name: string | null; email: string | null } }).visitors

    // Mark resolved
    await supabase
      .from('conversations')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', conversation_id)

    // Non-blocking: CSAT email + Zoho update
    Promise.allSettled([
      visitor?.email
        ? sendEmail({
            to: visitor.email,
            subject: 'How was your chat? ⭐',
            html: csatEmailHtml(visitor.name ?? '', conversation_id),
          })
        : Promise.resolve(),
      conv.zoho_lead_id
        ? updateLead(conv.zoho_lead_id, { Lead_Status: 'Chat Resolved' })
        : Promise.resolve(),
    ]).catch(console.error)

    return json({ success: true })
  } catch (e) {
    console.error('conversation-resolve error:', e)
    return error('Internal server error', 500)
  }
})
