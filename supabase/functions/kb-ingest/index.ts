// Knowledge base ingestion — chunks text and stores embeddings in pgvector

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleOptions, json, error } from '../_shared/cors.ts'
import { createEmbedding } from '../_shared/openai.ts'

// Approximate tokenisation: 1 token ≈ 4 chars
function chunkText(text: string, chunkTokens = 400, overlapTokens = 50): string[] {
  const chunkChars   = chunkTokens   * 4
  const overlapChars = overlapTokens * 4
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + chunkChars, text.length)
    chunks.push(text.slice(start, end).trim())
    start += chunkChars - overlapChars
    if (start >= text.length) break
  }
  return chunks.filter((c) => c.length > 60)
}

async function embedAndInsertChunks(
  supabase: ReturnType<typeof createClient>,
  docId: string,
  workspaceId: string,
  chunks: string[],
): Promise<void> {
  // Process in batches of 10 to respect rate limits
  const batchSize = 10
  let chunkIndex = 0
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize)
    const embeddings = await Promise.all(batch.map(createEmbedding))
    const rows = batch.map((content, j) => ({
      workspace_id: workspaceId,
      document_id:  docId,
      chunk_index:  chunkIndex++,
      content,
      embedding:    `[${embeddings[j].join(',')}]`,  // pgvector literal format
      token_count:  Math.ceil(content.length / 4),
    }))
    await supabase.from('kb_chunks').insert(rows)
  }
}

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

    // Verify agent JWT
    const { data: { user } } = await createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    ).auth.getUser()
    if (!user) return error('Unauthorized', 401)

    const { data: agent } = await supabase.from('agents').select('workspace_id').eq('id', user.id).single()
    if (!agent) return error('Agent not found', 403)

    const body = await req.json()
    const { source_type, title, content, conversation_id, document_id: existingDocId } = body

    if (!source_type || !title) return error('source_type and title required')
    if (agent.workspace_id !== body.workspace_id) return error('Workspace mismatch', 403)

    const workspaceId = agent.workspace_id

    // Create or reuse kb_documents row
    let docId = existingDocId
    if (!docId) {
      const { data: doc } = await supabase
        .from('kb_documents')
        .insert({
          workspace_id: workspaceId,
          source_type,
          title,
          source_ref:  conversation_id ?? body.url ?? null,
          status:      'processing',
          created_by:  user.id,
        })
        .select('id')
        .single()
      docId = doc!.id
    } else {
      await supabase.from('kb_documents').update({ status: 'processing' }).eq('id', docId)
      // Delete old chunks before re-ingesting
      await supabase.from('kb_chunks').delete().eq('document_id', docId)
    }

    // Prepare text content per source type
    let textToChunk = content as string

    if (source_type === 'transcript' && conversation_id) {
      // Fetch conversation messages and format as dialogue
      const { data: msgs } = await supabase
        .from('messages')
        .select('sender_type, sender_name, content')
        .eq('conversation_id', conversation_id)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })

      textToChunk = (msgs ?? [])
        .filter((m) => m.content)
        .map((m) => {
          const role = m.sender_type === 'visitor' ? 'Visitor' : (m.sender_name ?? 'Agent')
          return `${role}: ${m.content}`
        })
        .join('\n')
    }

    if (!textToChunk?.trim()) {
      await supabase.from('kb_documents').update({ status: 'error', error_message: 'No text content' }).eq('id', docId)
      return error('No text content to ingest', 422)
    }

    const chunks = chunkText(textToChunk)

    try {
      await embedAndInsertChunks(supabase, docId, workspaceId, chunks)
      await supabase
        .from('kb_documents')
        .update({ status: 'ready', chunk_count: chunks.length })
        .eq('id', docId)
    } catch (e) {
      await supabase
        .from('kb_documents')
        .update({ status: 'error', error_message: String(e) })
        .eq('id', docId)
      throw e
    }

    return json({ document_id: docId, chunk_count: chunks.length })
  } catch (e) {
    console.error('kb-ingest error:', e)
    return error('Internal server error', 500)
  }
})
