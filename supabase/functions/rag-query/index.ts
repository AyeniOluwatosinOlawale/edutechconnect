// Internal RAG brain — called only by visitor-message (service role)
// NOT exposed to the public widget directly

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleOptions, json, error } from '../_shared/cors.ts'
import { createEmbedding, chatCompletion, llmWantsEscalation } from '../_shared/openai.ts'

const DEFAULT_SYSTEM_PROMPT = `You are a helpful support assistant.
Answer the visitor's question using ONLY the context provided.
If the answer is not clearly in the context, say:
"I don't have that information — let me connect you with a human agent."
Keep answers concise (under 150 words). Be friendly and professional.
Never make up information not present in the context.`

interface RagQueryInput {
  workspace_id:         string
  conversation_id:      string
  visitor_message:      string
  history:              Array<{ role: 'user' | 'assistant'; content: string }>
  confidence_threshold: number
  max_chunks:           number
  system_prompt:        string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()

  try {
    const body: RagQueryInput = await req.json()
    const {
      workspace_id,
      conversation_id,
      visitor_message,
      history = [],
      confidence_threshold = 0.75,
      max_chunks = 4,
      system_prompt = DEFAULT_SYSTEM_PROMPT,
    } = body

    if (!workspace_id || !visitor_message) {
      return error('workspace_id and visitor_message required')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Step 1 — embed the visitor query
    let queryEmbedding: number[]
    try {
      queryEmbedding = await createEmbedding(visitor_message)
    } catch (e) {
      console.error('Embedding failed:', e)
      return json({ reply: null, should_escalate: true, top_score: 0, chunk_ids_used: [], prompt_tokens: 0, reply_tokens: 0 })
    }

    // Step 2 — vector similarity search via Postgres function
    const { data: chunks, error: matchErr } = await supabase.rpc('match_chunks', {
      query_embedding: queryEmbedding,
      p_workspace_id: workspace_id,
      match_threshold: confidence_threshold,
      match_count: max_chunks,
    })

    const topScore = chunks?.[0]?.similarity ?? 0
    const chunkIds = (chunks ?? []).map((c: { id: string }) => c.id)

    if (matchErr || !chunks || chunks.length === 0 || topScore < confidence_threshold) {
      // Log the failed lookup
      await supabase.from('rag_query_log').insert({
        workspace_id,
        conversation_id,
        visitor_message,
        top_score: topScore,
        chunk_ids_used: chunkIds,
        was_escalated: true,
      })
      return json({ reply: null, should_escalate: true, top_score: topScore, chunk_ids_used: chunkIds, prompt_tokens: 0, reply_tokens: 0 })
    }

    // Step 3 — build context and call GPT-4o
    const context = (chunks as Array<{ content: string }>).map((c) => c.content).join('\n---\n')

    let completionResult
    try {
      completionResult = await chatCompletion({
        systemPrompt: system_prompt,
        userMessage: visitor_message,
        context,
        history,
      })
    } catch (e) {
      console.error('GPT-4o failed:', e)
      return json({ reply: null, should_escalate: true, top_score: topScore, chunk_ids_used: chunkIds, prompt_tokens: 0, reply_tokens: 0 })
    }

    const shouldEscalate = llmWantsEscalation(completionResult.content)

    // Step 4 — log to rag_query_log
    await supabase.from('rag_query_log').insert({
      workspace_id,
      conversation_id,
      visitor_message,
      top_score: topScore,
      chunk_ids_used: chunkIds,
      llm_prompt_tokens: completionResult.prompt_tokens,
      llm_reply_tokens: completionResult.reply_tokens,
      reply_generated: completionResult.content,
      was_escalated: shouldEscalate,
    })

    return json({
      reply: shouldEscalate ? null : completionResult.content,
      should_escalate: shouldEscalate,
      top_score: topScore,
      chunk_ids_used: chunkIds,
      prompt_tokens: completionResult.prompt_tokens,
      reply_tokens: completionResult.reply_tokens,
    })
  } catch (e) {
    console.error('rag-query error:', e)
    return error('Internal server error', 500)
  }
})
