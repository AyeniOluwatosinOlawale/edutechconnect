import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleOptions, json, error } from '../_shared/cors.ts'
import { createLead, searchLeads } from '../_shared/zoho.ts'
import { createEmbedding, chatCompletion, llmWantsEscalation } from '../_shared/openai.ts'

const DEFAULT_SYSTEM_PROMPT = `You are a helpful support assistant.
Answer the visitor's question using ONLY the context provided.
If the answer is not clearly in the context, say:
"I don't have that information — let me connect you with a human agent."
Keep answers concise (under 150 words). Be friendly and professional.`

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
      // Merge into local visitor object so Zoho lead uses the new details
      if (visitor_name) visitor.name = visitor_name
      if (visitor_email) visitor.email = visitor_email
    }

    // Fetch workspace settings to check AI config
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('settings')
      .eq('id', workspace_id)
      .single()

    const settings = (workspace?.settings ?? {}) as Record<string, unknown>
    const aiEnabled = settings.ai_enabled === true

    let convId = conversation_id
    let isNewConversation = false
    let botReply: { id: string; content: string; created_at: string } | null = null

    // Create conversation if none exists
    if (!convId) {
      isNewConversation = true
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({
          workspace_id,
          visitor_id: visitor.id,
          status: 'waiting',
          ai_handled: aiEnabled,
        })
        .select('id')
        .single()

      convId = newConv!.id

      // Create AI state row for new conversation
      if (aiEnabled) {
        await supabase.from('conversation_ai_state').insert({
          conversation_id: convId,
          workspace_id,
          is_bot_active: true,
        })
      }

      // Non-blocking: Zoho lead + agent notifications (only for non-AI conversations,
      // or conversations where AI is disabled)
      if (!aiEnabled) {
        Promise.allSettled([
          handleZohoLead(visitor, convId),
          notifyAgents(supabase, workspace_id, convId, visitor.name),
        ]).catch(console.error)
      } else {
        // Still create Zoho lead in background for AI conversations
        handleZohoLead(visitor, convId).catch(console.error)
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
      .select('id')
      .single()

    // ── RAG AUTO-REPLY ──────────────────────────────────────────────────────
    if (aiEnabled) {
      // Check if bot is still active for this conversation
      const { data: aiState } = await supabase
        .from('conversation_ai_state')
        .select('is_bot_active')
        .eq('conversation_id', convId)
        .maybeSingle()

      const isBotActive = aiState?.is_bot_active ?? (isNewConversation && aiEnabled)

      if (isBotActive) {
        // Fetch recent conversation history for context window
        const { data: recentMessages } = await supabase
          .from('messages')
          .select('sender_type, content')
          .eq('conversation_id', convId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(12)

        const history = (recentMessages ?? [])
          .reverse()
          .filter((m) => m.content && m.sender_type !== 'system')
          .map((m) => ({
            role: (m.sender_type === 'visitor' ? 'user' : 'assistant') as 'user' | 'assistant',
            content: m.content,
          }))

        // ── Inline RAG pipeline ──────────────────────────────────────────────
        const confidenceThreshold = (settings.ai_confidence_threshold as number) ?? 0.75
        const maxChunks = (settings.ai_max_context_chunks as number) ?? 4
        const systemPrompt = (settings.ai_system_prompt as string) ?? DEFAULT_SYSTEM_PROMPT

        let rag: { reply: string | null; should_escalate: boolean; top_score: number; chunk_ids_used: string[] } | null = null
        try {
          // Step 1: embed visitor query
          const queryEmbedding = await createEmbedding(content.trim())

          // Step 2: vector similarity search
          const { data: chunks, error: matchErr } = await supabase.rpc('match_chunks', {
            query_embedding: queryEmbedding,
            p_workspace_id: workspace_id,
            match_threshold: confidenceThreshold,
            match_count: maxChunks,
          })

          const topScore = chunks?.[0]?.similarity ?? 0
          const chunkIds = (chunks ?? []).map((c: { id: string }) => c.id)

          if (matchErr || !chunks || chunks.length === 0 || topScore < confidenceThreshold) {
            rag = { reply: null, should_escalate: true, top_score: topScore, chunk_ids_used: chunkIds }
          } else {
            // Step 3: GPT-4o completion
            const context = (chunks as Array<{ content: string }>).map((c) => c.content).join('\n---\n')
            const completion = await chatCompletion({ systemPrompt, userMessage: content.trim(), context, history })
            const shouldEscalate = llmWantsEscalation(completion.content)
            rag = {
              reply: shouldEscalate ? null : completion.content,
              should_escalate: shouldEscalate,
              top_score: topScore,
              chunk_ids_used: chunkIds,
            }
          }
        } catch (ragErr) {
          console.error('[visitor-message] RAG pipeline error:', ragErr)
          rag = null
        }

        if (!rag || rag.should_escalate || !rag.reply) {
          // Escalate to human
          await supabase.from('conversation_ai_state').update({
            is_bot_active:  false,
            handoff_reason: 'low_confidence',
            handed_off_at:  new Date().toISOString(),
            last_top_score: rag?.top_score ?? 0,
          }).eq('conversation_id', convId)

          const { data: sysMsg } = await supabase.from('messages').insert({
            conversation_id: convId,
            workspace_id,
            sender_type: 'system',
            content: 'Connecting you with a human agent…',
          }).select('id, created_at').single()

          // Broadcast system message to widget
          await broadcastMessage(workspace_id, convId, {
            id: sysMsg?.id ?? crypto.randomUUID(),
            conversation_id: convId,
            sender_type: 'system',
            sender_name: null,
            content: 'Connecting you with a human agent…',
            created_at: sysMsg?.created_at ?? new Date().toISOString(),
          })

          // Now notify agents
          Promise.allSettled([
            notifyAgents(supabase, workspace_id, convId, visitor.name),
          ]).catch(console.error)
        } else {
          // Insert bot reply
          const { data: botMsg } = await supabase.from('messages').insert({
            conversation_id: convId,
            workspace_id,
            sender_type: 'bot',
            sender_name: 'AI Assistant',
            content_type: 'text',
            content: rag.reply,
          }).select('id, created_at').single()

          const botMsgId = botMsg?.id ?? crypto.randomUUID()
          const botMsgAt = botMsg?.created_at ?? new Date().toISOString()

          botReply = { id: botMsgId, content: rag.reply, created_at: botMsgAt }

          // Broadcast bot reply to widget immediately
          await broadcastMessage(workspace_id, convId, {
            id: botMsgId,
            conversation_id: convId,
            sender_type: 'bot',
            sender_name: 'AI Assistant',
            content: rag.reply,
            created_at: botMsgAt,
          })

          // Update AI state with context used
          await supabase.from('conversation_ai_state').update({
            last_chunk_ids: rag.chunk_ids_used,
            last_top_score: rag.top_score,
          }).eq('conversation_id', convId)
        }
      }
    }
    // ── END RAG ─────────────────────────────────────────────────────────────

    return json({
      message_id: message!.id,
      conversation_id: convId,
      ...(botReply ? { bot_reply: botReply } : {}),
    })
  } catch (e) {
    console.error('visitor-message error:', e)
    return error('Internal server error', 500)
  }
})

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

async function broadcastMessage(
  workspaceId: string,
  convId: string,
  payload: Record<string, unknown>,
) {
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
      messages: [{
        topic: `conversation:${convId}`,
        event: 'new_message',
        payload,
      }],
    }),
  }).catch(console.error)
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
      agent_id:        a.id,
      workspace_id:    workspaceId,
      type:            'new_conversation',
      conversation_id: convId,
      message:         `New chat from ${visitorName ?? 'a visitor'}`,
    })),
  )
}
