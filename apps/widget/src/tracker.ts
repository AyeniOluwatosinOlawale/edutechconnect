import { updateSession } from './api'

export function startTracker(visitorToken: string, workspaceId: string) {
  let lastUrl = location.href
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  function sendUpdate() {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      updateSession({ visitor_token: visitorToken, workspace_id: workspaceId, current_url: location.href })
    }, 5_000)
  }

  window.addEventListener('popstate', sendUpdate)
  window.addEventListener('hashchange', sendUpdate)

  // Intercept pushState for SPAs
  const originalPushState = history.pushState.bind(history)
  history.pushState = function (...args) {
    originalPushState(...args)
    if (location.href !== lastUrl) {
      lastUrl = location.href
      sendUpdate()
    }
  }

  // Heartbeat every 30s for "Visitors Online" panel
  setInterval(() => {
    updateSession({ visitor_token: visitorToken, workspace_id: workspaceId, current_url: location.href })
  }, 30_000)
}
