import type { InitResponse, SendMessageResponse } from './types'

declare const __FUNCTIONS_URL__: string
declare const __SUPABASE_ANON_KEY__: string

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${__FUNCTIONS_URL__}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${__SUPABASE_ANON_KEY__}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

export async function initWidget(params: {
  workspaceKey: string
  visitor_token: string | null
  page_url: string
  referrer: string
  user_agent: string
}): Promise<InitResponse> {
  return post<InitResponse>('widget-init', params)
}

export async function sendMessage(params: {
  visitor_token: string
  workspace_id: string
  content: string
  conversation_id: string | null
}): Promise<SendMessageResponse> {
  return post<SendMessageResponse>('visitor-message', params)
}

export async function requestHuman(params: {
  visitor_token: string
  conversation_id: string
}): Promise<void> {
  return post<void>('visitor-human-request', params)
}

export async function updateSession(params: {
  visitor_token: string
  workspace_id: string
  current_url: string
}): Promise<void> {
  // Fire-and-forget — intentionally no await
  fetch(`${__FUNCTIONS_URL__}/widget-heartbeat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${__SUPABASE_ANON_KEY__}`,
    },
    body: JSON.stringify(params),
  }).catch(() => {})
}
