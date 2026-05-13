// Guard against double-init
if (window.__EDU_CHAT_LOADED__) {
  throw new Error('EduChat already loaded')
}
window.__EDU_CHAT_LOADED__ = true

import { initWidget, sendMessage, requestHuman } from './api'
import { getVisitorToken, setVisitorToken, setSession } from './storage'
import { subscribe, broadcast } from './realtime'
import { ChatPanel } from './ui/panel'
import { startTracker } from './tracker'
import type { ChatMessage, WorkspaceSettings } from './types'

;(async () => {
  const config = window.EduChatConfig
  if (!config?.workspaceKey) {
    console.error('[EduChat] window.EduChatConfig.workspaceKey is required')
    return
  }

  let state: {
    visitorToken: string
    visitorId: string
    workspaceId: string
    conversationId: string | null
    settings: WorkspaceSettings
    isAiActive: boolean
  } | null = null

  let panel: ChatPanel | null = null

  try {
    const initData = await initWidget({
      workspaceKey: config.workspaceKey,
      visitor_token: getVisitorToken(),
      page_url: location.href,
      referrer: document.referrer,
      user_agent: navigator.userAgent,
    })

    setVisitorToken(initData.visitor_token)
    setSession({ visitor_id: initData.visitor_id, workspace_id: initData.workspace_id })

    state = {
      visitorToken: initData.visitor_token,
      visitorId: initData.visitor_id,
      workspaceId: initData.workspace_id,
      conversationId: initData.conversation_id,
      settings: initData.workspace_settings,
      isAiActive: initData.workspace_settings.ai_enabled ?? false,
    }

    // Mount widget
    const container = document.createElement('div')
    container.id = 'edu-chat-root'
    document.body.appendChild(container)

    panel = new ChatPanel(container, state.settings, {
      onSend: async (text) => {
        if (!state) return
        try {
          const res = await sendMessage({
            visitor_token: state.visitorToken,
            workspace_id: state.workspaceId,
            content: text,
            conversation_id: state.conversationId,
          })
          state.conversationId = res.conversation_id
          panel?.appendMessage({
            id: res.message_id,
            sender_type: 'visitor',
            sender_name: null,
            content: text,
            created_at: new Date().toISOString(),
          })
          // Subscribe to conversation channel once we have an id
          if (!state.conversationId) {
            state.conversationId = res.conversation_id
            subscribeConversation(res.conversation_id, panel!)
          }
        } catch (e) {
          console.error('[EduChat] Failed to send message', e)
        }
      },
      onClose: () => {},
      onTyping: (isTyping) => {
        if (!state?.conversationId) return
        broadcast(
          `conversation:${state.conversationId}`,
          'typing',
          { sender_type: 'visitor', is_typing: isTyping },
        )
      },
      onHumanRequest: async () => {
        if (!state?.conversationId) return
        try {
          await requestHuman({
            visitor_token: state.visitorToken,
            conversation_id: state.conversationId,
          })
          state.isAiActive = false
          panel?.setAiMode(false)
        } catch (e) {
          console.error('[EduChat] Failed to request human', e)
        }
      },
    })

    // Activate AI mode if enabled in workspace settings
    if (state.isAiActive) {
      panel.setAiMode(true)
      // Show AI greeting if this is a fresh session
      if (!state.conversationId && state.settings.ai_greeting_message) {
        panel.appendMessage({
          id: `greeting-${Date.now()}`,
          sender_type: 'bot',
          sender_name: null,
          content: state.settings.ai_greeting_message,
          created_at: new Date().toISOString(),
        })
      }
    }

    // Subscribe to incoming agent/bot messages
    subscribe(`visitor:${state.visitorId}`, (raw) => {
      const msg = raw as { payload?: { data?: { new?: ChatMessage } } }
      const newMsg = msg?.payload?.data?.new
      if (!newMsg) return
      if (newMsg.sender_type === 'agent' || newMsg.sender_type === 'bot') {
        panel?.appendMessage(newMsg)
      }
      // A system message with 'agent' content signals AI is off
      if (newMsg.sender_type === 'system') {
        if (state && state.isAiActive) {
          state.isAiActive = false
          panel?.setAiMode(false)
        }
      }
    })

    // Subscribe to conversation channel if we already have one
    if (state.conversationId) {
      subscribeConversation(state.conversationId, panel)
    }

    startTracker(state.visitorToken, state.workspaceId)

    // Public API
    window.EduChat = {
      open: () => panel?.open(),
      close: () => panel?.close(),
      requestHuman: () => panel && state?.conversationId
        ? requestHuman({ visitor_token: state.visitorToken, conversation_id: state.conversationId })
            .then(() => { if (state) { state.isAiActive = false; panel?.setAiMode(false) } })
            .catch(() => {})
        : Promise.resolve(),
    }
  } catch (e) {
    console.error('[EduChat] Failed to initialize', e)
  }

  function subscribeConversation(convId: string, p: ChatPanel) {
    subscribe(`conversation:${convId}`, (raw) => {
      const msg = raw as {
        event?: string
        payload?: {
          sender_type?: string
          is_typing?: boolean
          data?: { new?: ChatMessage }
        }
      }
      if (msg.event === 'typing' && msg.payload?.sender_type === 'agent') {
        p.setAgentTyping(msg.payload.is_typing ?? false)
      }
      if (msg.event === 'INSERT') {
        const newMsg = msg.payload?.data?.new
        if (!newMsg) return
        if (newMsg.sender_type === 'agent' || newMsg.sender_type === 'bot') {
          p.appendMessage(newMsg)
        }
        if (newMsg.sender_type === 'system' && state?.isAiActive) {
          state.isAiActive = false
          p.setAiMode(false)
        }
      }
    })
  }
})()
