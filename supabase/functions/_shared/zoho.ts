// Zoho CRM OAuth2 client — token refresh + Lead CRUD
// Tokens are stored in workspaces.settings to persist across invocations.

const ZOHO_TOKEN_URL = Deno.env.get('ZOHO_ACCOUNTS_URL') ?? 'https://accounts.zoho.eu/oauth/v2/token'
const ZOHO_API_BASE = (Deno.env.get('ZOHO_API_DOMAIN') ?? 'https://www.zohoapis.eu') + '/crm/v3'

interface ZohoTokens {
  access_token: string
  expires_at: number  // unix ms
}

interface ZohoLead {
  Last_Name: string
  First_Name?: string
  Email?: string
  Phone?: string
  Lead_Source?: string
  Description?: string
  [key: string]: unknown
}

// Fetch a fresh access token using the stored refresh token
async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get('ZOHO_CLIENT_ID')!
  const clientSecret = Deno.env.get('ZOHO_CLIENT_SECRET')!
  const refreshToken = Deno.env.get('ZOHO_REFRESH_TOKEN')!

  const res = await fetch(
    `${ZOHO_TOKEN_URL}?grant_type=refresh_token&client_id=${clientId}&client_secret=${clientSecret}&refresh_token=${refreshToken}`,
    { method: 'POST' },
  )

  if (!res.ok) throw new Error(`Zoho token refresh failed: ${res.status}`)
  const data = await res.json()
  return data.access_token as string
}

async function zohoRequest(
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const token = await getAccessToken()
  const res = await fetch(`${ZOHO_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify({ data: [body] }) : undefined,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Zoho API ${method} ${path} failed (${res.status}): ${text}`)
  }
  return res.json()
}

export async function createLead(lead: ZohoLead): Promise<string | null> {
  try {
    const result = await zohoRequest('POST', '/Leads', lead) as {
      data: Array<{ code: string; details: { id: string } }>
    }
    return result.data?.[0]?.details?.id ?? null
  } catch (e) {
    console.error('createLead error:', e)
    return null
  }
}

export async function updateLead(
  leadId: string,
  fields: Partial<ZohoLead>,
): Promise<void> {
  try {
    await zohoRequest('PUT', `/Leads/${leadId}`, fields)
  } catch (e) {
    console.error('updateLead error:', e)
  }
}

export async function searchLeads(email: string): Promise<string | null> {
  try {
    const token = await getAccessToken()
    const res = await fetch(
      `${ZOHO_API_BASE}/Leads/search?email=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Zoho-oauthtoken ${token}` } },
    )
    if (!res.ok) return null
    const data = await res.json() as { data: Array<{ id: string }> }
    return data.data?.[0]?.id ?? null
  } catch (e) {
    console.error('searchLeads error:', e)
    return null
  }
}
