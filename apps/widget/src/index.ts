if (window.__EDU_CHAT_LOADED__) {
  throw new Error('EduChat already loaded')
}
window.__EDU_CHAT_LOADED__ = true

import { initWidget, sendMessage, requestHuman } from './api'
import { getVisitorToken, setVisitorToken, setSession } from './storage'
import { subscribe, broadcast } from './realtime'
import { ChatPanel } from './ui/panel'
import { startTracker } from './tracker'
import type { ChatMessage, PreChatData } from './types'

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
    isAiActive: boolean
    preChatData: PreChatData | null
    preChatSent: boolean
  } | null = null

  let panel: ChatPanel | null = null
  const subscribedConvIds = new Set<string>()

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
      isAiActive: initData.workspace_settings.ai_enabled ?? false,
      preChatData: null,
      preChatSent: !!initData.conversation_id, // skip pre-chat if returning visitor
    }

    const container = document.createElement('div')
    container.id = 'edu-chat-root'
    document.body.appendChild(container)

    panel = new ChatPanel(
      container,
      initData.workspace_settings,
      initData.workspace_name ?? '',
      {
        onSend: async (text) => {
          if (!state) return
          try {
            // Show visitor message immediately before awaiting the API — correct order
            const tempId = `opt-${Date.now()}`
            panel?.appendMessage({
              id: tempId,
              sender_type: 'visitor',
              sender_name: null,
              content: text,
              created_at: new Date().toISOString(),
            })

            const res = await sendMessage({
              visitor_token: state.visitorToken,
              workspace_id: state.workspaceId,
              content: text,
              conversation_id: state.conversationId,
              ...(!state.preChatSent && state.preChatData ? {
                visitor_name: state.preChatData.name,
                visitor_email: state.preChatData.email,
                visitor_phone: state.preChatData.phone,
              } : {}),
            })
            state.preChatSent = true
            state.conversationId = res.conversation_id

            // Mark the real DB message ID as seen so the server broadcast doesn't duplicate it
            panel?.markSeen(res.message_id)

            if (!subscribedConvIds.has(res.conversation_id)) {
              subscribeConversation(res.conversation_id, panel!)
            }

            if (res.bot_reply) {
              panel?.appendMessage({
                id: res.bot_reply.id,
                sender_type: 'bot',
                sender_name: 'AI Assistant',
                content: res.bot_reply.content,
                created_at: res.bot_reply.created_at,
              })
              if (res.suggested_questions?.length) {
                panel?.showSuggestions(res.suggested_questions)
              }
            }
            if (res.system_message) {
              panel?.appendMessage({
                id: res.system_message.id,
                sender_type: 'system',
                sender_name: null,
                content: res.system_message.content,
                created_at: res.system_message.created_at,
              })
            }
          } catch (e) {
            console.error('[EduChat] Failed to send message', e)
          }
        },
        onClose: () => {},
        onTyping: (isTyping) => {
          if (!state?.conversationId) return
          broadcast(`conversation:${state.conversationId}`, 'typing', {
            sender_type: 'visitor',
            is_typing: isTyping,
          })
        },
        onHumanRequest: async () => {
          if (!state?.conversationId) return
          try {
            await requestHuman({
              visitor_token: state.visitorToken,
              conversation_id: state.conversationId,
            })
          } catch (e) {
            console.error('[EduChat] Failed to request human', e)
          }
        },
        onPreChatSubmit: (data: PreChatData) => {
          if (state) state.preChatData = data
        },
        onCsat: (rating) => {
          if (!state?.conversationId) return
          // Fire-and-forget CSAT rating save
          fetch(`${(window as unknown as Record<string, unknown>).__EDU_FUNCTIONS_URL__ ?? ''}/visitor-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              visitor_token: state.visitorToken,
              workspace_id: state.workspaceId,
              conversation_id: state.conversationId,
              csat_rating: rating,
            }),
          }).catch(() => {})
        },
      },
      !!initData.conversation_id, // existingConversation
    )

    // Show AI greeting + suggestion chips for new visitors
    if (!state.conversationId) {
      const greeting = initData.workspace_settings.ai_greeting_message
        ?? 'Hi there! I am your AI assistant. Ask me about our programs, courses, fees, or enrollment process.'
      panel.appendMessage({
        id: `greeting-${Date.now()}`,
        sender_type: 'bot',
        sender_name: null,
        content: greeting,
        created_at: new Date().toISOString(),
      })
      panel.showSuggestions([
        'What programs do you offer?',
        'How much are the course fees?',
        'How do I enroll?',
        'What are the entry requirements?',
      ])
    }

    if (state.conversationId) {
      subscribeConversation(state.conversationId, panel)
    }

    startTracker(state.visitorToken, state.workspaceId)

    window.EduChat = {
      open: () => panel?.open(),
      close: () => panel?.close(),
      requestHuman: () => panel && state?.conversationId
        ? requestHuman({ visitor_token: state.visitorToken, conversation_id: state.conversationId }).catch(() => {})
        : Promise.resolve(),
    }
  } catch (e) {
    console.error('[EduChat] Failed to initialize', e)
  }

  function subscribeConversation(convId: string, p: ChatPanel) {
    if (subscribedConvIds.has(convId)) return
    subscribedConvIds.add(convId)

    subscribe(`conversation:${convId}`, (event, payload) => {
      if (event === 'typing') {
        if (payload.sender_type === 'agent') {
          p.setAgentTyping(payload.is_typing as boolean ?? false, payload.agent_name as string | undefined)
        }
        return
      }
      if (event === 'new_message') {
        const msg = payload as unknown as ChatMessage
        if (msg.sender_type === 'agent' || msg.sender_type === 'bot' || msg.sender_type === 'system') {
          p.appendMessage(msg)
        }
        // no-op: AI mode indicator removed
      }
    })
  }
})()
