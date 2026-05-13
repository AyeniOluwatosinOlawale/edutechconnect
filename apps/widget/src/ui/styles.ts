export function buildStyles(brandColor: string): string {
  return `
    :host { all: initial; }

    .edu-bubble {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: ${brandColor};
      box-shadow: 0 4px 16px rgba(0,0,0,0.24);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s ease;
      z-index: 2147483647;
      border: none;
      outline: none;
    }
    .edu-bubble:hover { transform: scale(1.08); }
    .edu-bubble svg { width: 26px; height: 26px; fill: #fff; }

    .edu-badge {
      position: absolute;
      top: -2px;
      right: -2px;
      background: #ef4444;
      color: #fff;
      border-radius: 50%;
      width: 18px;
      height: 18px;
      font-size: 10px;
      font-family: sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      display: none;
    }
    .edu-badge.visible { display: flex; }

    .edu-panel {
      position: fixed;
      bottom: 92px;
      right: 24px;
      width: 360px;
      max-height: 520px;
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.18);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      z-index: 2147483646;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      opacity: 0;
      transform: translateY(12px) scale(0.97);
      pointer-events: none;
      transition: opacity 0.2s ease, transform 0.2s ease;
    }
    .edu-panel.open {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: all;
    }

    .edu-header {
      background: ${brandColor};
      color: #fff;
      padding: 16px;
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }
    .edu-header-title { font-weight: 600; font-size: 15px; }
    .edu-header-sub { font-size: 12px; opacity: 0.85; }
    .edu-header-close {
      margin-left: auto;
      background: none;
      border: none;
      color: #fff;
      cursor: pointer;
      padding: 4px;
      opacity: 0.8;
      line-height: 1;
      font-size: 18px;
    }
    .edu-header-close:hover { opacity: 1; }

    .edu-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .edu-messages::-webkit-scrollbar { width: 4px; }
    .edu-messages::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }

    .edu-msg {
      max-width: 80%;
      padding: 10px 14px;
      border-radius: 14px;
      line-height: 1.45;
      word-break: break-word;
    }
    .edu-msg.visitor {
      align-self: flex-end;
      background: ${brandColor};
      color: #fff;
      border-bottom-right-radius: 4px;
    }
    .edu-msg.agent {
      align-self: flex-start;
      background: #f1f5f9;
      color: #1e293b;
      border-bottom-left-radius: 4px;
    }
    .edu-msg.system {
      align-self: center;
      background: transparent;
      color: #94a3b8;
      font-size: 12px;
      padding: 4px 0;
    }
    .edu-msg-name {
      font-size: 11px;
      opacity: 0.7;
      margin-bottom: 3px;
    }

    .edu-typing {
      align-self: flex-start;
      display: flex;
      gap: 4px;
      padding: 10px 14px;
      background: #f1f5f9;
      border-radius: 14px;
      border-bottom-left-radius: 4px;
    }
    .edu-typing span {
      width: 7px;
      height: 7px;
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
      padding: 12px 16px;
      border-top: 1px solid #f1f5f9;
      flex-shrink: 0;
    }
    .edu-input {
      flex: 1;
      border: 1.5px solid #e2e8f0;
      border-radius: 10px;
      padding: 9px 12px;
      font-size: 14px;
      font-family: inherit;
      resize: none;
      outline: none;
      line-height: 1.4;
      max-height: 100px;
      overflow-y: auto;
      transition: border-color 0.15s;
    }
    .edu-input:focus { border-color: ${brandColor}; }
    .edu-send {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: ${brandColor};
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: opacity 0.15s;
    }
    .edu-send:disabled { opacity: 0.4; cursor: default; }
    .edu-send svg { width: 16px; height: 16px; fill: #fff; }

    .edu-msg.bot {
      align-self: flex-start;
      background: #f5f3ff;
      color: #3b0764;
      border-bottom-left-radius: 4px;
      border: 1px solid #ede9fe;
    }
    .edu-ai-label {
      font-size: 10px;
      color: #7c3aed;
      font-weight: 600;
      margin-bottom: 3px;
      display: flex;
      align-items: center;
      gap: 3px;
    }

    .edu-ai-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 16px;
      background: #f5f3ff;
      border-bottom: 1px solid #ede9fe;
      font-size: 11px;
      color: #7c3aed;
      font-weight: 500;
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
      50% { opacity: 0.4; }
    }

    .edu-human-btn {
      margin-left: auto;
      background: none;
      border: 1px solid #7c3aed;
      color: #7c3aed;
      border-radius: 6px;
      padding: 2px 8px;
      font-size: 10px;
      font-weight: 500;
      cursor: pointer;
      font-family: inherit;
      transition: background 0.15s;
    }
    .edu-human-btn:hover { background: #ede9fe; }

    /* ── Pre-chat form ── */
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
      line-height: 1.5;
    }
    .edu-field {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .edu-field label {
      font-size: 12px;
      font-weight: 600;
      color: #374151;
    }
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
      font-weight: 600;
      cursor: pointer;
      width: 100%;
      margin-top: 4px;
      font-family: inherit;
      transition: opacity 0.15s;
    }
    .edu-start-btn:hover { opacity: 0.9; }
    .edu-start-btn:disabled { opacity: 0.5; cursor: default; }

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
    .edu-empty-icon { font-size: 32px; }

    @media (max-width: 420px) {
      .edu-panel {
        right: 0; bottom: 0;
        width: 100vw; max-height: 85vh;
        border-radius: 16px 16px 0 0;
      }
      .edu-bubble { bottom: 16px; right: 16px; }
    }
  `
}
