export const channels = {
  workspace: (workspaceId: string) => `workspace:${workspaceId}`,
  conversation: (conversationId: string) => `conversation:${conversationId}`,
  visitor: (visitorId: string) => `visitor:${visitorId}`,
  presence: (workspaceId: string) => `presence:workspace:${workspaceId}`,
  sessions: (workspaceId: string) => `sessions:workspace:${workspaceId}`,
}
