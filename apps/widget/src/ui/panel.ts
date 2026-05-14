import type { ChatMessage, WorkspaceSettings, PreChatData } from '../types'
import { buildStyles } from './styles'

export interface PanelCallbacks {
  onSend: (text: string) => void
  onClose: () => void
  onTyping: (isTyping: boolean) => void
  onHumanRequest: () => void
  onPreChatSubmit: (data: PreChatData) => void
  onCsat?: (rating: number) => void
}

// Tiny in-memory audio ping (data URL) — no external asset needed
const PING_URL = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='

function playPing() {
  try {
    const a = new Audio(PING_URL)
    a.volume = 0.35
    a.play().catch(() => {/* blocked by autoplay policy — fine */})
  } catch { /* ignore */ }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

export class ChatPanel {
  private root: ShadowRoot
  private panel!: HTMLDivElement
  private prechatView!: HTMLDivElement
  private chatView!: HTMLDivElement
  private messagesEl!: HTMLDivElement
  private input!: HTMLTextAreaElement
  private sendBtn!: HTMLButtonElement
  private typingEl!: HTMLDivElement
  private typingLabel!: HTMLSpanElement
  private badge!: HTMLDivElement
  private aiIndicatorEl!: HTMLDivElement
  private humanBtn!: HTMLButtonElement
  private csatEl!: HTMLDivElement
  private isOpen = false
  private unreadCount = 0
  private typingTimeout: ReturnType<typeof setTimeout> | null = null
  private seenIds = new Set<string>()
  private preChatDone = false
  private csatShown = false

  constructor(
    private container: HTMLDivElement,
    private settings: WorkspaceSettings,
    private workspaceName: string,
    private callbacks: PanelCallbacks,
    existingConversation: boolean,
  ) {
    this.preChatDone = existingConversation || !(settings.prechat_enabled ?? true)
    this.root = container.attachShadow({ mode: 'closed' })
    this.build()
  }

  private build() {
    const brandColor = this.settings.brand_color ?? '#6366f1'

    const sheet = new CSSStyleSheet()
    sheet.replaceSync(buildStyles(brandColor))
    this.root.adoptedStyleSheets = [sheet]

    // Bubble
    const bubble = document.createElement('button')
    bubble.className = 'edu-bubble'
    bubble.setAttribute('aria-label', 'Open chat')
    bubble.innerHTML = this.chatIcon()
    bubble.onclick = () => this.toggle()

    this.badge = document.createElement('div')
    this.badge.className = 'edu-badge'
    bubble.appendChild(this.badge)

    // Panel
    this.panel = document.createElement('div')
    this.panel.className = 'edu-panel'
    this.panel.setAttribute('role', 'dialog')
    this.panel.setAttribute('aria-modal', 'true')
    this.panel.setAttribute('aria-label', 'Live chat')

    // Header
    const header = document.createElement('div')
    header.className = 'edu-header'

    const avatar = document.createElement('div')
    avatar.className = 'edu-header-avatar'
    avatar.textContent = (this.workspaceName || 'C').charAt(0).toUpperCase()
    header.appendChild(avatar)

    const headerText = document.createElement('div')
    headerText.style.cssText = 'flex:1;min-width:0;'
    headerText.innerHTML = `
      <div class="edu-header-title">${this.workspaceName || 'Chat with us'}</div>
      <div class="edu-header-sub">${this.preChatDone
        ? (this.settings.greeting_text ?? 'We typically reply in a few minutes')
        : (this.settings.prechat_subtitle ?? 'Just a few quick details to get started')
      }</div>
    `
    header.appendChild(headerText)

    const closeBtn = document.createElement('button')
    closeBtn.className = 'edu-header-close'
    closeBtn.setAttribute('aria-label', 'Close chat')
    closeBtn.textContent = '×'
    closeBtn.onclick = () => this.close()
    header.appendChild(closeBtn)

    // ── Pre-chat form view ──
    this.prechatView = document.createElement('div')
    this.prechatView.className = 'edu-prechat'

    const intro = document.createElement('p')
    intro.className = 'edu-prechat-intro'
    intro.textContent = 'Hi! To help you better, please fill in your details below. It only takes a moment.'

    const nameField = this.buildField('Full Name', 'name', 'text', 'e.g. Amaka Johnson', true)
    const emailField = this.buildField('Email Address', 'email', 'email', 'e.g. amaka@gmail.com', false)
    const phoneField = this.buildField('Phone Number', 'phone', 'tel', 'e.g. 08012345678', false)

    const nameInput = nameField.querySelector('input') as HTMLInputElement
    const emailInput = emailField.querySelector('input') as HTMLInputElement
    const phoneInput = phoneField.querySelector('input') as HTMLInputElement

    const startBtn = document.createElement('button')
    startBtn.className = 'edu-start-btn'
    startBtn.textContent = 'Start Chat →'
    startBtn.onclick = () => {
      const name = nameInput.value.trim()
      if (!name) { nameInput.focus(); return }
      this.callbacks.onPreChatSubmit({
        name,
        email: emailInput.value.trim(),
        phone: phoneInput.value.trim(),
      })
      this.switchToChat()
    }

    phoneInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') startBtn.click()
    })

    this.prechatView.appendChild(intro)
    this.prechatView.appendChild(nameField)
    this.prechatView.appendChild(emailField)
    this.prechatView.appendChild(phoneField)
    this.prechatView.appendChild(startBtn)

    // ── Chat view ──
    this.chatView = document.createElement('div')
    this.chatView.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;'

    // AI indicator bar
    this.aiIndicatorEl = document.createElement('div')
    this.aiIndicatorEl.className = 'edu-ai-indicator'
    this.aiIndicatorEl.style.display = 'none'
    this.aiIndicatorEl.innerHTML = '<span class="edu-ai-dot"></span><span>AI Assistant</span>'
    this.humanBtn = document.createElement('button')
    this.humanBtn.className = 'edu-human-btn'
    this.humanBtn.textContent = 'Talk to human'
    this.humanBtn.onclick = () => this.callbacks.onHumanRequest()
    this.aiIndicatorEl.appendChild(this.humanBtn)

    // Messages
    this.messagesEl = document.createElement('div')
    this.messagesEl.className = 'edu-messages'
    this.messagesEl.setAttribute('aria-live', 'polite')

    const empty = document.createElement('div')
    empty.className = 'edu-empty'
    empty.innerHTML = '<div class="edu-empty-icon">💬</div><div>Send us a message and we\'ll get back to you!</div>'
    this.messagesEl.appendChild(empty)

    // Typing indicator with label
    const typingWrap = document.createElement('div')
    typingWrap.className = 'edu-typing-wrap'
    typingWrap.style.display = 'none'

    this.typingLabel = document.createElement('span')
    this.typingLabel.className = 'edu-typing-label'
    this.typingLabel.textContent = 'Agent is typing'

    this.typingEl = document.createElement('div')
    this.typingEl.className = 'edu-typing'
    this.typingEl.innerHTML = '<span></span><span></span><span></span>'

    typingWrap.appendChild(this.typingEl)
    typingWrap.appendChild(this.typingLabel)
    this.messagesEl.appendChild(typingWrap)

    // Store reference to the wrap for show/hide
    ;(this as unknown as Record<string, unknown>)._typingWrap = typingWrap

    // CSAT panel (hidden until conversation resolved)
    this.csatEl = document.createElement('div')
    this.csatEl.className = 'edu-csat'
    this.csatEl.style.display = 'none'
    this.csatEl.innerHTML = `
      <div class="edu-csat-title">How was your experience?</div>
      <div class="edu-csat-stars">
        ${[1,2,3,4,5].map(n => `<button class="edu-star" data-rating="${n}" aria-label="${n} star">★</button>`).join('')}
      </div>
      <div class="edu-csat-thanks" style="display:none">Thanks for your feedback! 🙏</div>
    `
    this.csatEl.querySelectorAll('.edu-star').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const rating = parseInt((e.currentTarget as HTMLElement).dataset.rating ?? '0', 10)
        this.submitCsat(rating)
      })
      btn.addEventListener('mouseenter', (e) => {
        const r = parseInt((e.currentTarget as HTMLElement).dataset.rating ?? '0', 10)
        this.csatEl.querySelectorAll('.edu-star').forEach((s, i) => {
          s.classList.toggle('active', i < r)
        })
      })
      btn.addEventListener('mouseleave', () => {
        this.csatEl.querySelectorAll('.edu-star').forEach((s) => s.classList.remove('active'))
      })
    })

    // Input row
    const inputRow = document.createElement('div')
    inputRow.className = 'edu-input-row'

    this.input = document.createElement('textarea')
    this.input.className = 'edu-input'
    this.input.placeholder = 'Type a message…'
    this.input.rows = 1
    this.input.setAttribute('aria-label', 'Chat message input')
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.submit() }
    })
    this.input.addEventListener('input', () => {
      this.input.style.height = 'auto'
      this.input.style.height = `${Math.min(this.input.scrollHeight, 100)}px`
      this.callbacks.onTyping(true)
      if (this.typingTimeout) clearTimeout(this.typingTimeout)
      this.typingTimeout = setTimeout(() => this.callbacks.onTyping(false), 1500)
    })
    this.input.addEventListener('focusin', () => {
      setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 100)
    })

    this.sendBtn = document.createElement('button')
    this.sendBtn.className = 'edu-send'
    this.sendBtn.setAttribute('aria-label', 'Send message')
    this.sendBtn.innerHTML = this.sendIcon()
    this.sendBtn.onclick = () => this.submit()

    inputRow.appendChild(this.input)
    inputRow.appendChild(this.sendBtn)

    this.chatView.appendChild(this.aiIndicatorEl)
    this.chatView.appendChild(this.messagesEl)
    this.chatView.appendChild(this.csatEl)
    this.chatView.appendChild(inputRow)

    this.panel.appendChild(header)
    if (this.preChatDone) {
      this.panel.appendChild(this.chatView)
    } else {
      this.panel.appendChild(this.prechatView)
    }

    this.root.appendChild(this.panel)
    this.root.appendChild(bubble)
  }

  private buildField(label: string, name: string, type: string, placeholder: string, required: boolean) {
    const wrap = document.createElement('div')
    wrap.className = 'edu-field'
    const lbl = document.createElement('label')
    lbl.textContent = label + (required ? ' *' : '')
    const inp = document.createElement('input')
    inp.type = type
    inp.name = name
    inp.placeholder = placeholder
    if (required) inp.required = true
    wrap.appendChild(lbl)
    wrap.appendChild(inp)
    return wrap
  }

  private switchToChat() {
    this.preChatDone = true
    this.prechatView.remove()
    this.panel.appendChild(this.chatView)
    setTimeout(() => this.input.focus(), 100)
  }

  private submit() {
    const text = this.input.value.trim()
    if (!text) return
    this.input.value = ''
    this.input.style.height = 'auto'
    this.sendBtn.disabled = true
    this.callbacks.onSend(text)
    setTimeout(() => { this.sendBtn.disabled = false }, 500)
  }

  private submitCsat(rating: number) {
    this.csatEl.querySelectorAll('.edu-star').forEach((s, i) => {
      s.classList.toggle('active', i < rating)
      ;(s as HTMLButtonElement).disabled = true
    })
    const thanks = this.csatEl.querySelector('.edu-csat-thanks') as HTMLElement
    if (thanks) thanks.style.display = 'block'
    this.callbacks.onCsat?.(rating)
  }

  open() {
    this.isOpen = true
    this.panel.classList.add('open')
    this.unreadCount = 0
    this.badge.textContent = ''
    this.badge.classList.remove('visible')
    if (this.preChatDone) {
      setTimeout(() => this.input.focus(), 150)
    }
  }

  close() {
    this.isOpen = false
    this.panel.classList.remove('open')
    this.callbacks.onClose()
  }

  toggle() {
    this.isOpen ? this.close() : this.open()
  }

  appendMessage(msg: ChatMessage) {
    if (this.seenIds.has(msg.id)) return
    this.seenIds.add(msg.id)

    if (!this.preChatDone) this.switchToChat()

    const empty = this.messagesEl.querySelector('.edu-empty')
    if (empty) empty.remove()

    const typingWrap = (this as unknown as Record<string, unknown>)._typingWrap as HTMLElement

    // Check if conversation was resolved (system message)
    if (msg.sender_type === 'system' && msg.content?.toLowerCase().includes('resolv') && !this.csatShown) {
      this.showCsat()
    }

    // Outer wrap
    const wrap = document.createElement('div')
    wrap.className = `edu-msg-wrap ${msg.sender_type}`

    // Name label (agent / bot)
    if (msg.sender_type === 'bot') {
      const label = document.createElement('div')
      label.className = 'edu-ai-label'
      label.innerHTML = '✦ AI Assistant'
      wrap.appendChild(label)
    } else if (msg.sender_type === 'agent' && msg.sender_name) {
      const name = document.createElement('div')
      name.className = 'edu-msg-name'
      name.textContent = msg.sender_name
      wrap.appendChild(name)
    }

    // Bubble
    const bubble = document.createElement('div')
    bubble.className = `edu-msg ${msg.sender_type}`
    bubble.textContent = msg.content ?? ''
    wrap.appendChild(bubble)

    // Timestamp
    if (msg.created_at && msg.sender_type !== 'system') {
      const time = document.createElement('div')
      time.className = 'edu-msg-time'
      time.textContent = formatTime(msg.created_at)
      wrap.appendChild(time)
    }

    this.messagesEl.insertBefore(wrap, typingWrap)
    this.scrollToBottom()

    // Sound + badge for incoming messages
    if (msg.sender_type === 'agent' || msg.sender_type === 'bot') {
      playPing()
      if (!this.isOpen) {
        this.unreadCount++
        this.badge.textContent = String(this.unreadCount)
        this.badge.classList.add('visible')
      }
    }
  }

  showCsat() {
    if (this.csatShown) return
    this.csatShown = true
    this.csatEl.style.display = 'flex'
    // Disable input when resolved
    this.input.disabled = true
    this.input.placeholder = 'Conversation ended'
    this.sendBtn.disabled = true
  }

  setAiMode(active: boolean) {
    this.aiIndicatorEl.style.display = active ? 'flex' : 'none'
    this.input.placeholder = 'Type a message…'
  }

  setAgentTyping(isTyping: boolean, agentName?: string) {
    const typingWrap = (this as unknown as Record<string, unknown>)._typingWrap as HTMLElement
    typingWrap.style.display = isTyping ? 'flex' : 'none'
    this.typingLabel.textContent = agentName ? `${agentName} is typing` : 'Agent is typing'
    if (isTyping) this.scrollToBottom()
  }

  private scrollToBottom() {
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight
  }

  private chatIcon() {
    return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
    </svg>`
  }

  private sendIcon() {
    return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
    </svg>`
  }
}
