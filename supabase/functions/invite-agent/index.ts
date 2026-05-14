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

    const body = await req.json()
    const email = body.email?.trim()
    const inviteRole = body.role === 'admin' ? 'admin' : 'agent'
    if (!email) return error('email is required')

    // Check if email already in workspace (by email in auth.users joined to agents)
    const { data: existingList } = await serviceClient.auth.admin.listUsers()
    const existingUser = existingList?.users.find((u) => u.email === email)
    if (existingUser) {
      const { data: existingAgent } = await serviceClient
        .from('agents')
        .select('id')
        .eq('id', existingUser.id)
        .eq('workspace_id', agent.workspace_id)
        .maybeSingle()
      if (existingAgent) return error('This email is already a member of your workspace')
    }

    // Send invite via Supabase Admin API — sets workspace_id + role in user metadata
    const { data, error: inviteErr } = await serviceClient.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          workspace_id: agent.workspace_id,
          role: inviteRole,
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
