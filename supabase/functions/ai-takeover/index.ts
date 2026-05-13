// Agent clicks "Take Over" — deactivates bot, assigns agent to conversation

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleOptions, json, error } from '../_shared/cors.ts'

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

    const { data: agent } = await supabase.from('agents').select('id, workspace_id, display_name').eq('id', user.id).single()
    if (!agent) return error('Agent not found', 403)

    const { conversation_id } = await req.json()
    if (!conversation_id) return error('conversation_id required')

    // Verify conversation belongs to agent's workspace
    const { data: conv } = await supabase
      .from('conversations')
      .select('id, workspace_id, status')
      .eq('id', conversation_id)
      .single()

    if (!conv || conv.workspace_id !== agent.workspace_id) return error('Conversation not found', 404)

    // Flip AI state off
    await supabase.from('conversation_ai_state').upsert({
      conversation_id,
      workspace_id: agent.workspace_id,
      is_bot_active:   false,
      handoff_reason:  'agent_takeover',
      handed_off_at:   new Date().toISOString(),
    }, { onConflict: 'conversation_id' })

    // Insert system message visible to both sides
    await supabase.from('messages').insert({
      conversation_id,
      workspace_id: agent.workspace_id,
      sender_type: 'system',
      content: `${agent.display_name} has joined the conversation.`,
    })

    // Assign agent + mark active
    await supabase.from('conversations').update({
      assigned_agent_id: agent.id,
      status: 'active',
      first_response_at: new Date().toISOString(),
    }).eq('id', conversation_id).eq('status', 'waiting')

    return json({ success: true })
  } catch (e) {
    console.error('ai-takeover error:', e)
    return error('Internal server error', 500)
  }
})
