export function buildStyles(brandColor: string): string {
  return `
    :host { all: initial; }

    .edu-bubble {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: ${brandColor};
      box-shadow: 0 4px 20px rgba(0,0,0,0.28);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      z-index: 2147483647;
      border: none;
      outline: none;
    }
    .edu-bubble:hover { transform: scale(1.08); box-shadow: 0 6px 24px rgba(0,0,0,0.32); }
    .edu-bubble svg { width: 28px; height: 28px; fill: #fff; }

    .edu-badge {
      position: absolute;
      top: -2px;
      right: -2px;
      background: #ef4444;
      color: #fff;
      border-radius: 50%;
      width: 20px;
      height: 20px;
      font-size: 10px;
      font-family: sans-serif;
      font-weight: 700;
      display: none;
      align-items: center;
      justify-content: center;
      border: 2px solid #fff;
    }
    .edu-badge.visible { display: flex; }

    .edu-panel {
      position: fixed;
      bottom: 96px;
      right: 24px;
      width: 368px;
      height: 560px;
      max-height: calc(100vh - 120px);
      background: #fff;
      border-radius: 18px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.16);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      z-index: 2147483646;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      opacity: 0;
      transform: translateY(16px) scale(0.96);
      pointer-events: none;
      transition: opacity 0.22s ease, transform 0.22s ease;
    }
    .edu-panel.open {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: all;
    }

    .edu-header {
      background: ${brandColor};
      color: #fff;
      padding: 14px 16px;
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }
    .edu-header-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: rgba(255,255,255,0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
      flex-shrink: 0;
    }
    .edu-header-title { font-weight: 700; font-size: 15px; line-height: 1.2; }
    .edu-header-sub { font-size: 11px; opacity: 0.82; margin-top: 1px; }
    .edu-header-close {
      margin-left: auto;
      background: rgba(255,255,255,0.15);
      border: none;
      color: #fff;
      cursor: pointer;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      line-height: 1;
      transition: background 0.15s;
    }
    .edu-header-close:hover { background: rgba(255,255,255,0.28); }

    .edu-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px 12px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .edu-messages::-webkit-scrollbar { width: 4px; }
    .edu-messages::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }

    .edu-msg-wrap {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin-bottom: 6px;
    }
    .edu-msg-wrap.visitor { align-items: flex-end; }
    .edu-msg-wrap.agent, .edu-msg-wrap.bot, .edu-msg-wrap.system { align-items: flex-start; }

    .edu-msg {
      max-width: 80%;
      padding: 9px 13px;
      border-radius: 16px;
      line-height: 1.5;
      word-break: break-word;
      font-size: 13.5px;
    }
    .edu-msg.visitor {
      background: ${brandColor};
      color: #fff;
      border-bottom-right-radius: 4px;
    }
    .edu-msg.agent {
      background: #f1f5f9;
      color: #1e293b;
      border-bottom-left-radius: 4px;
    }
    .edu-msg.system {
      background: transparent;
      color: #94a3b8;
      font-size: 11.5px;
      padding: 2px 8px;
      text-align: center;
      max-width: 90%;
    }
    .edu-msg.bot {
      background: #f5f3ff;
      color: #2e1065;
      border-bottom-left-radius: 4px;
      border: 1px solid #ede9fe;
    }

    .edu-msg-name {
      font-size: 11px;
      color: #64748b;
      font-weight: 600;
      padding: 0 4px;
      margin-bottom: 1px;
    }
    .edu-ai-label {
      font-size: 10px;
      color: #7c3aed;
      font-weight: 700;
      margin-bottom: 3px;
      display: flex;
      align-items: center;
      gap: 3px;
      letter-spacing: 0.02em;
    }
    .edu-msg-time {
      font-size: 10px;
      color: #94a3b8;
      padding: 0 4px;
    }

    .edu-typing-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0 8px;
    }
    .edu-typing-label { font-size: 11px; color: #94a3b8; }
    .edu-typing {
      display: flex;
      gap: 4px;
      padding: 8px 12px;
      background: #f1f5f9;
      border-radius: 14px;
      border-bottom-left-radius: 4px;
    }
    .edu-typing span {
      width: 6px;
      height: 6px;
      background: #94a3b8;
      border-radius: 50%;
      animation: bounce 1.2s infinite;
    }
    .edu-typing span:nth-child(2) { animation-delay: 0.2s; }
    .edu-typing span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes bounce {
      0%, 60%, 100% { transform: translateY(0); }
      30% { transform: translateY(-5px); }
    }

    .edu-input-row {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      padding: 10px 12px 12px;
      border-top: 1px solid #f1f5f9;
      flex-shrink: 0;
    }
    .edu-input {
      flex: 1;
      border: 1.5px solid #e2e8f0;
      border-radius: 12px;
      padding: 9px 12px;
      font-size: 13.5px;
      font-family: inherit;
      resize: none;
      outline: none;
      line-height: 1.4;
      max-height: 100px;
      overflow-y: auto;
      transition: border-color 0.15s;
      color: #1e293b;
    }
    .edu-input:focus { border-color: ${brandColor}; }
    .edu-input::placeholder { color: #94a3b8; }
    .edu-send {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: ${brandColor};
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: opacity 0.15s, transform 0.15s;
    }
    .edu-send:disabled { opacity: 0.35; cursor: default; }
    .edu-send:not(:disabled):hover { transform: scale(1.08); }
    .edu-send svg { width: 16px; height: 16px; fill: #fff; }

    .edu-ai-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      background: #f5f3ff;
      border-bottom: 1px solid #ede9fe;
      font-size: 11px;
      color: #7c3aed;
      font-weight: 600;
      flex-shrink: 0;
    }
    .edu-ai-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #7c3aed;
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.35; }
    }
    .edu-human-btn {
      margin-left: auto;
      background: none;
      border: 1.5px solid #7c3aed;
      color: #7c3aed;
      border-radius: 6px;
      padding: 3px 10px;
      font-size: 10px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      transition: background 0.15s;
    }
    .edu-human-btn:hover { background: #ede9fe; }

    /* Pre-chat form */
    .edu-prechat {
      flex: 1;
      overflow-y: auto;
      padding: 20px 16px 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .edu-prechat-intro {
      color: #475569;
      font-size: 13px;
      line-height: 1.55;
    }
    .edu-field { display: flex; flex-direction: column; gap: 5px; }
    .edu-field label { font-size: 12px; font-weight: 600; color: #374151; }
    .edu-field input {
      border: 1.5px solid #e2e8f0;
      border-radius: 8px;
      padding: 9px 11px;
      font-size: 14px;
      font-family: inherit;
      outline: none;
      color: #1e293b;
      transition: border-color 0.15s;
      background: #fff;
    }
    .edu-field input:focus { border-color: ${brandColor}; }
    .edu-field input::placeholder { color: #94a3b8; }
    .edu-start-btn {
      background: ${brandColor};
      color: #fff;
      border: none;
      border-radius: 10px;
      padding: 12px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      width: 100%;
      margin-top: 4px;
      font-family: inherit;
      transition: opacity 0.15s;
    }
    .edu-start-btn:hover { opacity: 0.9; }
    .edu-start-btn:disabled { opacity: 0.5; cursor: default; }

    /* CSAT */
    .edu-csat {
      padding: 20px 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      text-align: center;
      border-top: 1px solid #f1f5f9;
      flex-shrink: 0;
    }
    .edu-csat-title { font-size: 13px; font-weight: 600; color: #374151; }
    .edu-csat-stars { display: flex; gap: 6px; }
    .edu-star {
      font-size: 28px;
      cursor: pointer;
      color: #d1d5db;
      transition: color 0.15s, transform 0.1s;
      background: none;
      border: none;
      padding: 0;
      line-height: 1;
    }
    .edu-star:hover, .edu-star.active { color: #f59e0b; transform: scale(1.15); }
    .edu-csat-thanks { font-size: 12px; color: #64748b; }

    .edu-empty {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: #94a3b8;
      text-align: center;
      padding: 24px;
    }
    .edu-empty-icon { font-size: 36px; }
    .edu-empty div { font-size: 13px; line-height: 1.5; }

    @media (max-width: 420px) {
      .edu-panel {
        right: 0; bottom: 0;
        width: 100vw;
        height: 85vh;
        max-height: 85vh;
        border-radius: 20px 20px 0 0;
      }
      .edu-bubble { bottom: 16px; right: 16px; }
    }
  `
}
