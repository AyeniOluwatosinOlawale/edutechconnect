import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleOptions, json, error } from '../_shared/cors.ts'
import { createLead, searchLeads } from '../_shared/zoho.ts'
import { createEmbedding, chatCompletion } from '../_shared/openai.ts'

const DEFAULT_SYSTEM_PROMPT = `You are a helpful support assistant for an education platform.
Answer the visitor's question using ONLY the context provided.
If the answer is not in the context, say you are not sure and invite them to ask about programs, courses, fees, or enrollment.
Keep answers concise (under 150 words). Be friendly and professional.`

// Mirror the same strict human-request detection as telegram-webhook
function wantsHuman(text: string): boolean {
  const t = text.toLowerCase().trim()
  return (
    t === 'human' ||
    t === 'agent' ||
    /^(i want|i need|can i (speak|talk|chat)|connect me|transfer me).*(human|agent|person|someone|staff)/i.test(t) ||
    /^(speak|talk|chat) (to|with) (a |an |)(human|agent|person|real person|live agent)/i.test(t)
  )
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()

  try {
    const body = await req.json()
    const { visitor_token, workspace_id, content, conversation_id, visitor_name, visitor_email, visitor_phone } = body

    if (!visitor_token || !workspace_id || !content?.trim()) {
      return error('visitor_token, workspace_id, and content are required')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Verify visitor
    const { data: visitor } = await supabase
      .from('visitors')
      .select('id, name, email, workspace_id')
      .eq('visitor_token', visitor_token)
      .eq('workspace_id', workspace_id)
      .single()

    if (!visitor) return error('Invalid visitor token', 401)

    // Update visitor details from pre-chat form if provided
    if (visitor_name || visitor_email || visitor_phone) {
      const updates: Record<string, string> = {}
      if (visitor_name) updates.name = visitor_name
      if (visitor_email) updates.email = visitor_email
      if (visitor_phone) updates.phone = visitor_phone
      await supabase.from('visitors').update(updates).eq('id', visitor.id)
      if (visitor_name) visitor.name = visitor_name
      if (visitor_email) visitor.email = visitor_email
    }

    // Fetch workspace settings
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('settings')
      .eq('id', workspace_id)
      .single()

    const settings = (workspace?.settings ?? {}) as Record<string, unknown>
    // Default AI to ON (same as telegram-webhook) — explicit false to disable
    const aiEnabled = settings.ai_enabled !== false
    const confidenceThreshold = (settings.ai_confidence_threshold as number) ?? 0.30
    const maxChunks = (settings.ai_max_context_chunks as number) ?? 4
    const systemPrompt = (settings.ai_system_prompt as string) ?? DEFAULT_SYSTEM_PROMPT

    let convId = conversation_id
    let isNewConversation = false
    let botReply: { id: string; content: string; created_at: string } | null = null
    let systemMessage: { id: string; content: string; created_at: string } | null = null

    // Create conversation if none exists
    if (!convId) {
      isNewConversation = true
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({
          workspace_id,
          visitor_id: visitor.id,
          status: 'waiting',
          source: 'widget',
          ai_handled: aiEnabled,
        })
        .select('id')
        .single()

      convId = newConv!.id

      if (aiEnabled) {
        await supabase.from('conversation_ai_state').insert({
          conversation_id: convId,
          workspace_id,
          is_bot_active: true,
        })
      }

      // Background: Zoho lead
      handleZohoLead(visitor, convId).catch(console.error)

      // Notify agents only for non-AI conversations
      if (!aiEnabled) {
        notifyAgents(supabase, workspace_id, convId, visitor.name).catch(console.error)
      }
    }

    // Insert visitor message
    const { data: message } = await supabase
      .from('messages')
      .insert({
        conversation_id: convId,
        workspace_id,
        sender_type: 'visitor',
        sender_id: visitor.id,
        sender_name: visitor.name ?? 'Visitor',
        content_type: 'text',
        content: content.trim(),
      })
      .select('id, created_at')
      .single()

    // Broadcast visitor message immediately so dashboard sees it without Realtime lag
    if (message) {
      await broadcastToConversation(convId, {
        id: message.id,
        conversation_id: convId,
        sender_type: 'visitor',
        sender_name: visitor.name ?? 'Visitor',
        content: content.trim(),
        created_at: message.created_at,
      })
    }

    // ── AI PIPELINE ─────────────────────────────────────────────────────────
    if (aiEnabled) {
      const { data: aiState } = await supabase
        .from('conversation_ai_state')
        .select('is_bot_active')
        .eq('conversation_id', convId)
        .maybeSingle()

      const isBotActive = aiState?.is_bot_active ?? (isNewConversation && aiEnabled)

      if (isBotActive) {
        // ── Explicit human request — skip RAG, hand off immediately ──
        if (wantsHuman(content.trim())) {
          await Promise.all([
            supabase.from('conversation_ai_state').update({
              is_bot_active: false,
              handoff_reason: 'user_request',
              handed_off_at: new Date().toISOString(),
            }).eq('conversation_id', convId),
            supabase.from('conversations').update({ status: 'waiting', ai_handled: false }).eq('id', convId),
          ])

          const sysMsgContent = "I'll connect you with a human agent right away."
          const { data: sysMsg } = await supabase.from('messages').insert({
            conversation_id: convId,
            workspace_id,
            sender_type: 'system',
            content: sysMsgContent,
          }).select('id, created_at').single()

          const sysMsgId = sysMsg?.id ?? crypto.randomUUID()
          const sysMsgAt = sysMsg?.created_at ?? new Date().toISOString()
          systemMessage = { id: sysMsgId, content: sysMsgContent, created_at: sysMsgAt }

          await broadcastToConversation(convId, {
            id: sysMsgId,
            conversation_id: convId,
            sender_type: 'system',
            sender_name: null,
            content: sysMsgContent,
            created_at: sysMsgAt,
          })

          await notifyAgents(supabase, workspace_id, convId, visitor.name)

          return json({
            message_id: message!.id,
            conversation_id: convId,
            system_message: systemMessage,
          })
        }

        // ── RAG pipeline ──
        let shouldEscalate = false
        let ragReply: string | null = null
        let topScore = 0
        let chunkIds: string[] = []

        try {
          const { data: recentMessages } = await supabase
            .from('messages')
            .select('sender_type, content')
            .eq('conversation_id', convId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(10)

          const history = (recentMessages ?? [])
            .reverse()
            .filter((m) => m.content && m.sender_type !== 'system')
            .map((m) => ({
              role: (m.sender_type === 'visitor' ? 'user' : 'assistant') as 'user' | 'assistant',
              content: m.content,
            }))

          const queryEmbedding = await createEmbedding(content.trim())

          const { data: chunks, error: matchErr } = await supabase.rpc('match_chunks', {
            query_embedding: queryEmbedding,
            p_workspace_id: workspace_id,
            match_threshold: confidenceThreshold,
            match_count: maxChunks,
          })

          topScore = chunks?.[0]?.similarity ?? 0
          chunkIds = (chunks ?? []).map((c: { id: string }) => c.id)

          if (matchErr || !chunks || chunks.length === 0 || topScore < confidenceThreshold) {
            shouldEscalate = true
          } else {
            const context = (chunks as Array<{ content: string }>).map((c) => c.content).join('\n---\n')
            const completion = await chatCompletion({ systemPrompt, userMessage: content.trim(), context, history })
            ragReply = completion.content
          }
        } catch (ragErr) {
          console.error('[visitor-message] RAG error:', ragErr)
          shouldEscalate = true
        }

        if (shouldEscalate || !ragReply) {
          // Escalate to human
          await Promise.all([
            supabase.from('conversation_ai_state').update({
              is_bot_active: false,
              handoff_reason: 'low_confidence',
              handed_off_at: new Date().toISOString(),
              last_top_score: topScore,
            }).eq('conversation_id', convId),
            supabase.from('conversations').update({ status: 'waiting', ai_handled: false }).eq('id', convId),
          ])

          const sysMsgContent = "I'll connect you with a human agent who can help further."
          const { data: sysMsg } = await supabase.from('messages').insert({
            conversation_id: convId,
            workspace_id,
            sender_type: 'system',
            content: sysMsgContent,
          }).select('id, created_at').single()

          const sysMsgId = sysMsg?.id ?? crypto.randomUUID()
          const sysMsgAt = sysMsg?.created_at ?? new Date().toISOString()
          systemMessage = { id: sysMsgId, content: sysMsgContent, created_at: sysMsgAt }

          await broadcastToConversation(convId, {
            id: sysMsgId,
            conversation_id: convId,
            sender_type: 'system',
            sender_name: null,
            content: sysMsgContent,
            created_at: sysMsgAt,
          })

          await notifyAgents(supabase, workspace_id, convId, visitor.name)
        } else {
          // Save and broadcast bot reply
          const { data: botMsg } = await supabase.from('messages').insert({
            conversation_id: convId,
            workspace_id,
            sender_type: 'bot',
            sender_name: 'AI Assistant',
            content_type: 'text',
            content: ragReply,
          }).select('id, created_at').single()

          const botMsgId = botMsg?.id ?? crypto.randomUUID()
          const botMsgAt = botMsg?.created_at ?? new Date().toISOString()
          botReply = { id: botMsgId, content: ragReply, created_at: botMsgAt }

          await broadcastToConversation(convId, {
            id: botMsgId,
            conversation_id: convId,
            sender_type: 'bot',
            sender_name: 'AI Assistant',
            content: ragReply,
            created_at: botMsgAt,
          })

          await supabase.from('conversation_ai_state').update({
            last_chunk_ids: chunkIds,
            last_top_score: topScore,
          }).eq('conversation_id', convId)
        }
      }
    }
    // ── END AI PIPELINE ─────────────────────────────────────────────────────

    return json({
      message_id: message!.id,
      conversation_id: convId,
      ...(botReply ? { bot_reply: botReply } : {}),
      ...(systemMessage ? { system_message: systemMessage } : {}),
    })
  } catch (e) {
    console.error('visitor-message error:', e)
    return error('Internal server error', 500)
  }
})

async function broadcastToConversation(convId: string, payload: Record<string, unknown>) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      messages: [{ topic: `conversation:${convId}`, event: 'new_message', payload }],
    }),
  }).catch(console.error)
}

async function handleZohoLead(
  visitor: { id: string; name: string | null; email: string | null; workspace_id: string },
  convId: string,
) {
  if (!visitor.email) return
  const existingId = await searchLeads(visitor.email)
  if (existingId) return
  const nameParts = (visitor.name ?? '').trim().split(' ')
  await createLead({
    First_Name: nameParts[0] ?? '',
    Last_Name: nameParts[1] ?? nameParts[0] ?? 'Unknown',
    Email: visitor.email,
    Lead_Source: 'Chat',
    Lead_Source_Channel: 'chatbot',
    Description: `Chat conversation ID: ${convId}`,
  })
}

async function notifyAgents(
  supabase: ReturnType<typeof createClient>,
  workspaceId: string,
  convId: string,
  visitorName: string | null,
) {
  const { data: agents } = await supabase
    .from('agents')
    .select('id')
    .eq('workspace_id', workspaceId)
    .in('status', ['online', 'busy'])

  if (!agents?.length) return

  await supabase.from('notifications').insert(
    agents.map((a) => ({
      agent_id: a.id,
      workspace_id: workspaceId,
      type: 'new_conversation',
      conversation_id: convId,
      message: `New chat from ${visitorName ?? 'a visitor'}`,
    })),
  )
}
