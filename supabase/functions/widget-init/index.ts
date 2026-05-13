import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleOptions, json, error } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()

  try {
    const body = await req.json()
    const { workspaceKey, visitor_token, page_url, referrer, user_agent } = body

    if (!workspaceKey) return error('workspaceKey required')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Resolve workspace from widget_key
    const { data: workspace, error: wsErr } = await supabase
      .from('workspaces')
      .select('id, name, settings')
      .eq('widget_key', workspaceKey)
      .single()

    if (wsErr || !workspace) return error('Invalid workspace key', 404)

    // Parse UA string minimally
    const device_type = /Mobile|Android|iPhone/i.test(user_agent ?? '')
      ? 'mobile'
      : /Tablet|iPad/i.test(user_agent ?? '')
      ? 'tablet'
      : 'desktop'

    // Upsert visitor
    let visitorId: string
    let newVisitorToken: string

    if (visitor_token) {
      const { data: existing } = await supabase
        .from('visitors')
        .select('id, visitor_token')
        .eq('visitor_token', visitor_token)
        .eq('workspace_id', workspace.id)
        .single()

      if (existing) {
        visitorId = existing.id
        newVisitorToken = existing.visitor_token
        // Update current_url
        await supabase
          .from('visitors')
          .update({ current_url: page_url, user_agent, device_type, referrer })
          .eq('id', visitorId)
      } else {
        // Token not found (cleared DB?) — create fresh visitor
        const { data: newVisitor } = await supabase
          .from('visitors')
          .insert({ workspace_id: workspace.id, current_url: page_url, referrer, user_agent, device_type })
          .select('id, visitor_token')
          .single()
        visitorId = newVisitor!.id
        newVisitorToken = newVisitor!.visitor_token
      }
    } else {
      const { data: newVisitor } = await supabase
        .from('visitors')
        .insert({ workspace_id: workspace.id, current_url: page_url, referrer, user_agent, device_type })
        .select('id, visitor_token')
        .single()
      visitorId = newVisitor!.id
      newVisitorToken = newVisitor!.visitor_token
    }

    // Upsert widget session
    await supabase.from('widget_sessions').upsert(
      { workspace_id: workspace.id, visitor_id: visitorId, current_url: page_url, last_seen_at: new Date().toISOString(), is_active: true },
      { onConflict: 'visitor_id' },
    )

    // Check for an active conversation
    const { data: activeConv } = await supabase
      .from('conversations')
      .select('id, status')
      .eq('visitor_id', visitorId)
      .in('status', ['waiting', 'active'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    return json({
      visitor_token: newVisitorToken,
      visitor_id: visitorId,
      workspace_id: workspace.id,
      conversation_id: activeConv?.id ?? null,
      workspace_name: workspace.name,
      workspace_settings: workspace.settings,
    })
  } catch (e) {
    console.error('widget-init error:', e)
    return error('Internal server error', 500)
  }
})
