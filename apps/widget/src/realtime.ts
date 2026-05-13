// Minimal Supabase Realtime client (Phoenix channels over WebSocket)
// Does NOT import @supabase/supabase-js — keeps bundle tiny.

declare const __SUPABASE_URL__: string
declare const __SUPABASE_ANON_KEY__: string

type MessageHandler = (payload: unknown) => void

interface Subscription {
  topic: string
  handler: MessageHandler
}

let ws: WebSocket | null = null
let subscriptions: Subscription[] = []
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let reconnectDelay = 1000
let ref = 0

function getRef() {
  return String(++ref)
}

function send(msg: object) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

function joinTopic(topic: string) {
  send({ topic, event: 'phx_join', payload: {}, ref: getRef() })
}

function startHeartbeat() {
  heartbeatTimer = setInterval(() => {
    send({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: getRef() })
  }, 30_000)
}

function connect() {
  const wsUrl = __SUPABASE_URL__
    .replace('https://', 'wss://')
    .replace('http://', 'ws://')

  ws = new WebSocket(
    `${wsUrl}/realtime/v1/websocket?apikey=${__SUPABASE_ANON_KEY__}&vsn=1.0.0`,
  )

  ws.onopen = () => {
    reconnectDelay = 1000
    startHeartbeat()
    // Re-join all active subscriptions
    subscriptions.forEach((s) => joinTopic(s.topic))
  }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string) as {
        topic: string
        event: string
        payload: unknown
      }
      subscriptions
        .filter((s) => s.topic === msg.topic)
        .forEach((s) => s.handler(msg))
    } catch {}
  }

  ws.onclose = () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    // Exponential backoff reconnect, cap at 30s
    setTimeout(connect, Math.min(reconnectDelay, 30_000))
    reconnectDelay = Math.min(reconnectDelay * 2, 30_000)
  }

  ws.onerror = () => ws?.close()
}

export function subscribe(topic: string, handler: MessageHandler): () => void {
  if (!ws) connect()
  subscriptions.push({ topic, handler })
  if (ws?.readyState === WebSocket.OPEN) joinTopic(topic)

  return () => {
    subscriptions = subscriptions.filter((s) => !(s.topic === topic && s.handler === handler))
  }
}

export function broadcast(topic: string, event: string, payload: unknown) {
  send({ topic, event, payload, ref: getRef() })
}
