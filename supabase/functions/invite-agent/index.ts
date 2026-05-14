import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleOptions, json, error } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return error('Unauthorized', 401)

  try {
    // Verify the calling agent is an admin
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user } } = await anonClient.auth.getUser()
    if (!user) return error('Unauthorized', 401)

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: agent } = await serviceClient
      .from('agents')
      .select('id, workspace_id, role')
      .eq('id', user.id)
      .single()

    if (!agent) return error('Agent not found', 403)
    if (agent.role !== 'admin') return error('Only admins can invite agents', 403)

    const { email } = await req.json()
    if (!email?.trim()) return error('email is required')

    // Check if user already exists in this workspace
    const { data: existing } = await serviceClient
      .from('agents')
      .select('id')
      .eq('workspace_id', agent.workspace_id)
      .maybeSingle()

    if (existing) return error('An agent with this email already exists in your workspace')

    // Send invite via Supabase Admin API — sets workspace_id + role in user metadata
    const { data, error: inviteErr } = await serviceClient.auth.admin.inviteUserByEmail(
      email.trim(),
      {
        data: {
          workspace_id: agent.workspace_id,
          role: 'agent',
        },
        redirectTo: `${Deno.env.get('DASHBOARD_URL') ?? 'https://edu-dashboard.vercel.app'}/login`,
      },
    )

    if (inviteErr) return error(inviteErr.message)

    return json({ success: true, user_id: data.user?.id })
  } catch (e) {
    console.error('invite-agent error:', e)
    return error('Internal server error', 500)
  }
})
