const VISITOR_TOKEN_KEY = 'edu_chat_visitor_token'
const SESSION_KEY = 'edu_chat_session'

export function getVisitorToken(): string | null {
  try {
    return localStorage.getItem(VISITOR_TOKEN_KEY)
  } catch {
    return null
  }
}

export function setVisitorToken(token: string): void {
  try {
    localStorage.setItem(VISITOR_TOKEN_KEY, token)
  } catch {
    // Storage blocked (private mode etc.) — continue without persistence
  }
}

export function getSession(): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setSession(data: Record<string, string>): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data))
  } catch {}
}
