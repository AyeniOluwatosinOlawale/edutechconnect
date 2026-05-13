// Meta Cloud API (WhatsApp Business) client

const META_BASE = 'https://graph.facebook.com/v19.0'

function getHeaders() {
  return {
    Authorization: `Bearer ${Deno.env.get('WHATSAPP_TOKEN')}`,
    'Content-Type': 'application/json',
  }
}

function phoneNumberId() {
  return Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')!
}

export async function sendTextMessage(to: string, text: string): Promise<void> {
  const res = await fetch(`${META_BASE}/${phoneNumberId()}/messages`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error(`WhatsApp sendTextMessage failed (${res.status}):`, err)
  }
}

export async function sendTemplate(
  to: string,
  templateName: string,
  components: unknown[] = [],
): Promise<void> {
  const res = await fetch(`${META_BASE}/${phoneNumberId()}/messages`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en' },
        components,
      },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error(`WhatsApp sendTemplate failed (${res.status}):`, err)
  }
}
