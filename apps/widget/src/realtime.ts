// Minimal Supabase Realtime client (Phoenix channels over WebSocket)
// Uses Broadcast (not Postgres Changes) so no RLS issues with anon key.

declare const __SUPABASE_URL__: string
declare const __SUPABASE_ANON_KEY__: string

type BroadcastHandler = (event: string, payload: Record<string, unknown>) => void

interface Chan {
  topic: string
  handlers: BroadcastHandler[]
  joined: boolean
}

let ws: WebSocket | null = null
const chans = new Map<string, Chan>()
let hbTimer: ReturnType<typeof setInterval> | null = null
let reconnectDelay = 1000
let ref = 0

function nextRef() { return String(++ref) }

function send(msg: object) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
}

function joinChan(c: Chan) {
  send({
    topic: c.topic,
    event: 'phx_join',
    payload: { config: { broadcast: { self: false }, presence: { key: '' } } },
    ref: nextRef(),
  })
}

function connect() {
  const wsUrl = __SUPABASE_URL__.replace('https://', 'wss://').replace('http://', 'ws://')
  ws = new WebSocket(`${wsUrl}/realtime/v1/websocket?apikey=${__SUPABASE_ANON_KEY__}&vsn=1.0.0`)

  ws.onopen = () => {
    reconnectDelay = 1000
    hbTimer = setInterval(() => {
      send({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: nextRef() })
    }, 25_000)
    chans.forEach((c) => joinChan(c))
  }

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data as string) as {
        topic: string
        event: string
        payload: Record<string, unknown>
      }
      const c = chans.get(msg.topic)
      if (!c) return

      if (msg.event === 'phx_reply' && (msg.payload as { status?: string }).status === 'ok') {
        c.joined = true
        return
      }

      if (msg.event === 'broadcast') {
        const evt = (msg.payload as { event?: string }).event ?? ''
        const payload = (msg.payload as { payload?: Record<string, unknown> }).payload ?? {}
        c.handlers.forEach((h) => h(evt, payload))
      }
    } catch {}
  }

  ws.onclose = () => {
    if (hbTimer) clearInterval(hbTimer)
    chans.forEach((c) => { c.joined = false })
    setTimeout(connect, Math.min(reconnectDelay, 30_000))
    reconnectDelay = Math.min(reconnectDelay * 2, 30_000)
  }

  ws.onerror = () => ws?.close()
}

function getOrCreate(topic: string): Chan {
  if (!chans.has(topic)) {
    const c: Chan = { topic, handlers: [], joined: false }
    chans.set(topic, c)
    if (!ws) connect()
    if (ws?.readyState === WebSocket.OPEN) joinChan(c)
  }
  return chans.get(topic)!
}

// Subscribe to broadcast events on a named channel.
// Returns an unsubscribe function.
export function subscribe(channelName: string, handler: BroadcastHandler): () => void {
  const topic = `realtime:${channelName}`
  const c = getOrCreate(topic)
  c.handlers.push(handler)
  return () => {
    c.handlers = c.handlers.filter((h) => h !== handler)
  }
}

// Send a broadcast event on a named channel.
export function broadcast(channelName: string, event: string, payload: Record<string, unknown>) {
  const topic = `realtime:${channelName}`
  send({
    topic,
    event: 'broadcast',
    payload: { type: 'broadcast', event, payload },
    ref: nextRef(),
  })
}
