import type { ChatMessage, WorkspaceSettings } from '../types'
import { buildStyles } from './styles'

export interface PanelCallbacks {
  onSend: (text: string) => void
  onClose: () => void
  onTyping: (isTyping: boolean) => void
  onHumanRequest: () => void
}

export class ChatPanel {
  private root: ShadowRoot
  private panel!: HTMLDivElement
  private messagesEl!: HTMLDivElement
  private input!: HTMLTextAreaElement
  private sendBtn!: HTMLButtonElement
  private typingEl!: HTMLDivElement
  private badge!: HTMLDivElement
  private aiIndicatorEl!: HTMLDivElement
  private humanBtn!: HTMLButtonElement
  private isOpen = false
  private unreadCount = 0
  private typingTimeout: ReturnType<typeof setTimeout> | null = null
  private seenIds = new Set<string>()

  constructor(
    private container: HTMLDivElement,
    private settings: WorkspaceSettings,
    private callbacks: PanelCallbacks,
  ) {
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
    header.innerHTML = `
      <div>
        <div class="edu-header-title">Chat with us</div>
        <div class="edu-header-sub">${this.settings.greeting_text ?? 'We typically reply in a few minutes'}</div>
      </div>
    `
    const closeBtn = document.createElement('button')
    closeBtn.className = 'edu-header-close'
    closeBtn.setAttribute('aria-label', 'Close chat')
    closeBtn.textContent = '×'
    closeBtn.onclick = () => this.close()
    header.appendChild(closeBtn)

    // AI indicator bar (hidden by default until setAiMode(true))
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

    // Typing indicator (hidden by default)
    this.typingEl = document.createElement('div')
    this.typingEl.className = 'edu-typing'
    this.typingEl.style.display = 'none'
    this.typingEl.innerHTML = '<span></span><span></span><span></span>'

    // Input row
    const inputRow = document.createElement('div')
    inputRow.className = 'edu-input-row'

    this.input = document.createElement('textarea')
    this.input.className = 'edu-input'
    this.input.placeholder = 'Type a message…'
    this.input.rows = 1
    this.input.setAttribute('aria-label', 'Chat message input')

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        this.submit()
      }
    })

    this.input.addEventListener('input', () => {
      // Auto-grow
      this.input.style.height = 'auto'
      this.input.style.height = `${Math.min(this.input.scrollHeight, 100)}px`
      // Typing indicator
      this.callbacks.onTyping(true)
      if (this.typingTimeout) clearTimeout(this.typingTimeout)
      this.typingTimeout = setTimeout(() => this.callbacks.onTyping(false), 1500)
    })

    // iOS scroll fix on focus
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

    this.messagesEl.appendChild(this.typingEl)
    this.panel.appendChild(header)
    this.panel.appendChild(this.aiIndicatorEl)
    this.panel.appendChild(this.messagesEl)
    this.panel.appendChild(inputRow)

    this.root.appendChild(this.panel)
    this.root.appendChild(bubble)
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

  open() {
    this.isOpen = true
    this.panel.classList.add('open')
    this.unreadCount = 0
    this.badge.textContent = ''
    this.badge.classList.remove('visible')
    setTimeout(() => this.input.focus(), 150)
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

    // Remove empty state if present
    const empty = this.messagesEl.querySelector('.edu-empty')
    if (empty) empty.remove()

    const el = document.createElement('div')
    el.className = `edu-msg ${msg.sender_type}`

    if (msg.sender_type === 'bot') {
      const label = document.createElement('div')
      label.className = 'edu-ai-label'
      label.innerHTML = '✦ AI Assistant'
      el.appendChild(label)
    } else if (msg.sender_name && msg.sender_type === 'agent') {
      const name = document.createElement('div')
      name.className = 'edu-msg-name'
      name.textContent = msg.sender_name
      el.appendChild(name)
    }

    const text = document.createElement('div')
    // Use textContent to prevent XSS
    text.textContent = msg.content ?? ''
    el.appendChild(text)

    // Insert before typing indicator
    this.messagesEl.insertBefore(el, this.typingEl)
    this.scrollToBottom()

    if (!this.isOpen && (msg.sender_type === 'agent' || msg.sender_type === 'bot')) {
      this.unreadCount++
      this.badge.textContent = String(this.unreadCount)
      this.badge.classList.add('visible')
    }
  }

  setAiMode(active: boolean) {
    this.aiIndicatorEl.style.display = active ? 'flex' : 'none'
    this.input.placeholder = active ? 'Ask AI anything… (or click "Talk to human")' : 'Type a message…'
  }

  setAgentTyping(isTyping: boolean) {
    this.typingEl.style.display = isTyping ? 'flex' : 'none'
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
