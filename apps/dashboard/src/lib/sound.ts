let ctx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  // Browser suspends AudioContext until a user gesture — resume silently
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function tone(freq: number, duration: number, gain: number, start: number, ac: AudioContext) {
  const osc = ac.createOscillator()
  const gainNode = ac.createGain()
  osc.connect(gainNode)
  gainNode.connect(ac.destination)
  osc.frequency.value = freq
  osc.type = 'sine'
  gainNode.gain.setValueAtTime(0, start)
  gainNode.gain.linearRampToValueAtTime(gain, start + 0.01)
  gainNode.gain.exponentialRampToValueAtTime(0.001, start + duration)
  osc.start(start)
  osc.stop(start + duration)
}

// Two-tone chime: plays when a new waiting conversation arrives
export function playNewConversation() {
  try {
    const ac = getCtx()
    const now = ac.currentTime
    tone(880, 0.18, 0.4, now, ac)
    tone(1100, 0.22, 0.35, now + 0.16, ac)
  } catch {
    // AudioContext not available (SSR / blocked)
  }
}

// Single soft ping: plays when a visitor sends a message
export function playNewMessage() {
  try {
    const ac = getCtx()
    const now = ac.currentTime
    tone(1046, 0.2, 0.3, now, ac)
  } catch {
    // AudioContext not available
  }
}
