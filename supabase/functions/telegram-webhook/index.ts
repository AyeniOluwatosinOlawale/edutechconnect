import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { json } from '../_shared/cors.ts'
import { sendMessage } from '../_shared/telegram.ts'
import { createEmbedding, chatCompletion } from '../_shared/openai.ts'

const DEFAULT_SYSTEM_PROMPT = `You are a helpful support assistant for an education platform.
Answer the visitor's question using ONLY the context provided.
If the answer is not in the context, say you are not sure and invite them to ask about programs, courses, fees, or enrollment.
Keep answers concise (under 150 words). Be friendly and professional.`

// Only escalate when user makes a clear, direct request for a human
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
  // Telegram sends POST with JSON
  if (req.method !== 'POST') return new Response('ok', { status: 200 })

  let update: { message?: { chat: { id: number }; text?: string; from?: { first_name?: string; username?: string } } }
  try {
    update = await req.json()
  } catch {
    return new Response('bad request', { status: 400 })
  }

  const msg = update.message
  if (!msg?.text) return new Response('ok', { status: 200 })

  const chatId = String(msg.chat.id)
  const text = msg.text.trim()
  const fromName = msg.from?.first_name ?? msg.from?.username ?? 'Visitor'

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    // Get default workspace (single-tenant setup)
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id, settings')
      .order('created_at')
      .limit(1)
      .single()

    if (!workspace) {
      await sendMessage(chatId, 'Service temporarily unavailable. Please try again later.')
      return json({ ok: true })
    }

    const workspaceId = workspace.id
    const settings = (workspace.settings ?? {}) as Record<string, unknown>
    const aiEnabled = settings.ai_enabled !== false // default true for telegram
    const confidenceThreshold = (settings.ai_confidence_threshold as number) ?? 0.30
    const maxChunks = (settings.ai_max_context_chunks as number) ?? 4
    const systemPrompt = (settings.ai_system_prompt as string) ?? DEFAULT_SYSTEM_PROMPT

    // Find or create visitor by telegram_chat_id
    let { data: visitor } = await supabase
      .from('visitors')
      .select('id, name')
      .eq('workspace_id', workspaceId)
      .eq('visitor_token', `tg_${chatId}`)
      .maybeSingle()

    if (!visitor) {
      const { data: newVisitor } = await supabase
        .from('visitors')
        .insert({
          workspace_id: workspaceId,
          visitor_token: `tg_${chatId}`,
          name: fromName,
        })
        .select('id, name')
        .single()
      visitor = newVisitor
    }

    if (!visitor) {
      await sendMessage(chatId, 'Sorry, something went wrong. Please try again.')
      return json({ ok: true })
    }

    // Find open conversation for this telegram chat
    let { data: conversation } = await supabase
      .from('conversations')
      .select('id, status, ai_handled')
      .eq('workspace_id', workspaceId)
      .eq('telegram_chat_id', chatId)
      .not('status', 'in', '("resolved","missed")')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const isNewConversation = !conversation

    if (!conversation) {
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({
          workspace_id: workspaceId,
          visitor_id: visitor.id,
          status: 'waiting',
          source: 'telegram',
          telegram_chat_id: chatId,
          ai_handled: aiEnabled,
        })
        .select('id, status, ai_handled')
        .single()
      conversation = newConv

      // Create AI state row
      if (aiEnabled) {
        await supabase.from('conversation_ai_state').insert({
          conversation_id: conversation!.id,
          workspace_id: workspaceId,
          is_bot_active: true,
        })
      }
    }

    if (!conversation) {
      await sendMessage(chatId, 'Sorry, something went wrong. Please try again.')
      return json({ ok: true })
    }

    const convId = conversation.id

    // Check if bot is still active
    const { data: aiState } = await supabase
      .from('conversation_ai_state')
      .select('is_bot_active')
      .eq('conversation_id', convId)
      .maybeSingle()

    const isBotActive = aiState?.is_bot_active ?? (isNewConversation && aiEnabled)

    // Save the incoming visitor message
    await supabase.from('messages').insert({
      conversation_id: convId,
      workspace_id: workspaceId,
      sender_type: 'visitor',
      sender_id: visitor.id,
      sender_name: visitor.name ?? fromName,
      content_type: 'text',
      content: text,
    })

    // ── Handle explicit human request ──
    if (wantsHuman(text)) {
      if (isBotActive) {
        await Promise.all([
          supabase.from('conversation_ai_state').update({
            is_bot_active: false,
            handoff_reason: 'user_request',
            handed_off_at: new Date().toISOString(),
          }).eq('conversation_id', convId),
          supabase.from('conversations').update({ status: 'waiting', ai_handled: false }).eq('id', convId),
        ])

        await supabase.from('messages').insert({
          conversation_id: convId,
          workspace_id: workspaceId,
          sender_type: 'system',
          content: "I'll connect you with a human agent who can help further.",
        })

        await notifyAgents(supabase, workspaceId, convId, visitor.name ?? fromName)
      }

      await sendMessage(chatId,
        `✅ Got it! I'm connecting you with a human agent now.\n\nAn agent will reply here shortly. Please stay in this chat.`
      )
      return json({ ok: true })
    }

    // ── If human already handling, don't respond ──
    if (!isBotActive) {
      // Silently save the message — agent will see it in dashboard
      return json({ ok: true })
    }

    // ── RAG pipeline ──
    let botReply: string | null = null
    let shouldEscalate = false

    try {
      // Fetch recent history
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

      const queryEmbedding = await createEmbedding(text)

      const { data: chunks, error: matchErr } = await supabase.rpc('match_chunks', {
        query_embedding: queryEmbedding,
        p_workspace_id: workspaceId,
        match_threshold: confidenceThreshold,
        match_count: maxChunks,
      })

      const topScore = chunks?.[0]?.similarity ?? 0

      if (matchErr || !chunks || chunks.length === 0 || topScore < confidenceThreshold) {
        shouldEscalate = true
      } else {
        const context = (chunks as Array<{ content: string }>).map((c) => c.content).join('\n---\n')
        const completion = await chatCompletion({ systemPrompt, userMessage: text, context, history })
        botReply = completion.content
      }
    } catch (ragErr) {
      console.error('[telegram-webhook] RAG error:', ragErr)
      shouldEscalate = true
    }

    if (shouldEscalate || !botReply) {
      // Escalate to human agent
      await Promise.all([
        supabase.from('conversation_ai_state').update({
          is_bot_active: false,
          handoff_reason: 'low_confidence',
          handed_off_at: new Date().toISOString(),
        }).eq('conversation_id', convId),
        supabase.from('conversations').update({ status: 'waiting', ai_handled: false }).eq('id', convId),
      ])

      await supabase.from('messages').insert({
        conversation_id: convId,
        workspace_id: workspaceId,
        sender_type: 'system',
        content: "I'll connect you with a human agent who can help further.",
      })

      await notifyAgents(supabase, workspaceId, convId, visitor.name ?? fromName)

      await sendMessage(chatId,
        `I'm not sure about that one. Let me connect you with a human agent who can help. 🙋\n\nAn agent will reply here shortly.`
      )
    } else {
      // Save and send bot reply
      await supabase.from('messages').insert({
        conversation_id: convId,
        workspace_id: workspaceId,
        sender_type: 'bot',
        sender_name: 'AI Assistant',
        content_type: 'text',
        content: botReply,
      })

      await sendMessage(chatId, `✦ ${botReply}`)
    }

    return json({ ok: true })
  } catch (e) {
    console.error('[telegram-webhook] error:', e)
    return json({ ok: false })
  }
})

async function notifyAgents(
  supabase: ReturnType<typeof createClient>,
  workspaceId: string,
  convId: string,
  visitorName: string,
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
      message: `New Telegram chat from ${visitorName}`,
    })),
  )
}
