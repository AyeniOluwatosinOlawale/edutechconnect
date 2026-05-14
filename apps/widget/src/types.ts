export interface EduChatConfig {
  workspaceKey: string
}

export interface WorkspaceSettings {
  brand_color?: string
  greeting_text?: string
  offline_message?: string
  widget_position?: 'bottom-right' | 'bottom-left'
  show_agent_names?: boolean
  ai_enabled?: boolean
  ai_greeting_message?: string
  prechat_enabled?: boolean
  prechat_subtitle?: string
}

export interface PreChatData {
  name: string
  email: string
  phone: string
}

export interface InitResponse {
  visitor_token: string
  visitor_id: string
  workspace_id: string
  conversation_id: string | null
  workspace_name: string
  workspace_settings: WorkspaceSettings
}

export interface SendMessageResponse {
  message_id: string
  conversation_id: string
  bot_reply?: { id: string; content: string; created_at: string }
  system_message?: { id: string; content: string; created_at: string }
}

export interface ChatMessage {
  id: string
  sender_type: 'visitor' | 'agent' | 'system' | 'bot'
  sender_name: string | null
  content: string | null
  created_at: string
}

export interface TypingEvent {
  sender_type: 'visitor' | 'agent'
  is_typing: boolean
}

declare global {
  interface Window {
    EduChatConfig: EduChatConfig
    __EDU_CHAT_LOADED__: boolean
    EduChat: {
      open: () => void
      close: () => void
      requestHuman: () => void
    }
  }
}
