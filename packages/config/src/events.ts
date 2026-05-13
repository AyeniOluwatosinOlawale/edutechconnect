export const EVENTS = {
  TYPING: 'typing',
  VISITOR_SESSION: 'visitor_session',
  AGENT_JOINED: 'agent_joined',
} as const

export const CONVERSATION_STATUS = {
  WAITING: 'waiting',
  ACTIVE: 'active',
  RESOLVED: 'resolved',
  MISSED: 'missed',
  ESCALATED: 'escalated',
} as const

export const SENDER_TYPE = {
  VISITOR: 'visitor',
  AGENT: 'agent',
  SYSTEM: 'system',
  BOT: 'bot',
} as const

export const AGENT_STATUS = {
  ONLINE: 'online',
  BUSY: 'busy',
  OFFLINE: 'offline',
} as const
