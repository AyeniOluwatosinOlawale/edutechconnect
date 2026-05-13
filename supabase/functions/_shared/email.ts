// Transactional email via Resend (https://resend.com)

const RESEND_API = 'https://api.resend.com/emails'
const FROM = 'EduTechConnect Chat <chat@edutechconnect.org>'

interface EmailPayload {
  to: string | string[]
  subject: string
  html: string
  text?: string
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set — skipping email')
    return
  }

  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, ...payload }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error(`Resend email failed (${res.status}):`, err)
  }
}

export function csatEmailHtml(visitorName: string, conversationId: string): string {
  const baseUrl = Deno.env.get('DASHBOARD_URL') ?? 'https://chat.edutechconnect.org'
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2>How was your chat experience?</h2>
      <p>Hi ${visitorName || 'there'},</p>
      <p>Thank you for chatting with us. We'd love to hear how it went.</p>
      <div style="display:flex;gap:8px;margin:24px 0">
        ${[1,2,3,4,5].map(score => `
          <a href="${baseUrl}/csat?id=${conversationId}&score=${score}"
             style="display:inline-block;padding:12px 16px;background:#6366f1;color:#fff;
                    text-decoration:none;border-radius:8px;font-size:20px">
            ${'⭐'.repeat(score)}
          </a>`).join('')}
      </div>
      <p style="color:#888;font-size:12px">EduTechConnect Support</p>
    </div>`
}
