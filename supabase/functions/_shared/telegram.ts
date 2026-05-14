const BASE = 'https://api.telegram.org/bot'

function token() {
  return Deno.env.get('TELEGRAM_BOT_TOKEN')!
}

export async function sendMessage(chatId: string, text: string): Promise<void> {
  const res = await fetch(`${BASE}${token()}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    console.error(`Telegram sendMessage failed (${res.status}):`, err)
    throw new Error(`Telegram error: ${err}`)
  }
}
