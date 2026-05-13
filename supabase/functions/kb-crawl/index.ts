// Crawl a URL, extract text, delegate to kb-ingest

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleOptions, json, error } from '../_shared/cors.ts'

function stripHtml(html: string): string {
  return html
    // Remove script/style/nav/footer blocks entirely
    .replace(/<(script|style|nav|footer|header|noscript)[^>]*>[\s\S]*?<\/\1>/gi, '')
    // Remove all remaining HTML tags
    .replace(/<[^>]+>/g, ' ')
    // Decode common HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Collapse whitespace
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

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

    const { data: agent } = await supabase.from('agents').select('workspace_id').eq('id', user.id).single()
    if (!agent) return error('Agent not found', 403)

    const { url, title } = await req.json()
    if (!url) return error('url required')
    if (!isValidUrl(url)) return error('Invalid URL — must be http or https')

    const workspaceId = agent.workspace_id

    // Create a pending document record
    const { data: doc } = await supabase
      .from('kb_documents')
      .insert({
        workspace_id: workspaceId,
        source_type: 'url',
        title: title ?? url,
        source_ref: url,
        status: 'processing',
        created_by: user.id,
      })
      .select('id')
      .single()

    const docId = doc!.id

    // Fetch the URL
    let html: string
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'EduChatBot/1.0 (+https://edutechconnect.org)' },
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      html = await res.text()
    } catch (e) {
      await supabase.from('kb_documents').update({ status: 'error', error_message: String(e) }).eq('id', docId)
      return error(`Failed to fetch URL: ${e}`, 422)
    }

    const textContent = stripHtml(html)

    if (textContent.length < 100) {
      await supabase.from('kb_documents').update({ status: 'error', error_message: 'Page has too little text content' }).eq('id', docId)
      return error('Page has too little extractable text', 422)
    }

    // Call kb-ingest internally with the extracted text
    const ingestRes = await supabase.functions.invoke('kb-ingest', {
      body: {
        source_type: 'url',
        title: title ?? url,
        content: textContent,
        workspace_id: workspaceId,
        document_id: docId,
      },
      headers: { Authorization: authHeader },
    })

    if (ingestRes.error) throw new Error(ingestRes.error.message)

    return json({ document_id: docId, ...ingestRes.data })
  } catch (e) {
    console.error('kb-crawl error:', e)
    return error('Internal server error', 500)
  }
})
