// Visitor clicks "Talk to a human" — deactivates bot, notifies agents

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleOptions, json, error } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { visitor_token, workspace_id, conversation_id } = await req.json()
    if (!visitor_token || !workspace_id || !conversation_id) {
      return error('visitor_token, workspace_id, and conversation_id required')
    }

    // Verify visitor_token
    const { data: visitor } = await supabase
      .from('visitors')
      .select('id')
      .eq('visitor_token', visitor_token)
      .eq('workspace_id', workspace_id)
      .single()

    if (!visitor) return error('Invalid visitor token', 401)

    // Verify conversation belongs to this visitor
    const { data: conv } = await supabase
      .from('conversations')
      .select('id, workspace_id')
      .eq('id', conversation_id)
      .eq('visitor_id', visitor.id)
      .single()

    if (!conv || conv.workspace_id !== workspace_id) return error('Conversation not found', 404)

    // Flip AI state off
    await supabase.from('conversation_ai_state').upsert({
      conversation_id,
      workspace_id,
      is_bot_active:  false,
      handoff_reason: 'visitor_requested',
      handed_off_at:  new Date().toISOString(),
    }, { onConflict: 'conversation_id' })

    // Insert system message
    await supabase.from('messages').insert({
      conversation_id,
      workspace_id,
      sender_type: 'system',
      content: 'Visitor requested a human agent. Connecting you now…',
    })

    // Notify online/busy agents
    const { data: agents } = await supabase
      .from('agents')
      .select('id')
      .eq('workspace_id', workspace_id)
      .in('status', ['online', 'busy'])

    if (agents?.length) {
      await supabase.from('notifications').insert(
        agents.map((a) => ({
          agent_id:        a.id,
          workspace_id,
          type:            'human_requested',
          conversation_id,
          message:         'A visitor is requesting a human agent',
        })),
      )
    }

    return json({ success: true })
  } catch (e) {
    console.error('visitor-human-request error:', e)
    return error('Internal server error', 500)
  }
})
