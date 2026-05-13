-- ============================================================
-- 0002_rls.sql — Row Level Security policies
-- ============================================================

ALTER TABLE workspaces        ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitors          ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE canned_responses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags               ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE widget_sessions    ENABLE ROW LEVEL SECURITY;

-- Helper: get the authenticated agent's workspace_id
CREATE OR REPLACE FUNCTION auth_agent_workspace_id()
RETURNS UUID AS $$
  SELECT workspace_id FROM agents WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: check if the authenticated agent is admin/owner
CREATE OR REPLACE FUNCTION auth_agent_is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM agents WHERE id = auth.uid() AND role IN ('owner', 'admin')
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ---------- workspaces ----------
CREATE POLICY "agents_select_own_workspace" ON workspaces
  FOR SELECT USING (id = auth_agent_workspace_id());

CREATE POLICY "admins_update_workspace" ON workspaces
  FOR UPDATE USING (id = auth_agent_workspace_id() AND auth_agent_is_admin());

-- ---------- agents ----------
CREATE POLICY "agents_select_workspace_agents" ON agents
  FOR SELECT USING (workspace_id = auth_agent_workspace_id());

CREATE POLICY "agents_update_own_record" ON agents
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY "admins_manage_agents" ON agents
  FOR ALL USING (workspace_id = auth_agent_workspace_id() AND auth_agent_is_admin());

-- ---------- visitors ----------
-- Agents can see all visitors in their workspace.
-- Visitors write via Edge Functions (service_role) — no direct anon access.
CREATE POLICY "agents_select_visitors" ON visitors
  FOR SELECT USING (workspace_id = auth_agent_workspace_id());

CREATE POLICY "agents_update_visitors" ON visitors
  FOR UPDATE USING (workspace_id = auth_agent_workspace_id());

-- ---------- conversations ----------
CREATE POLICY "agents_select_conversations" ON conversations
  FOR SELECT USING (workspace_id = auth_agent_workspace_id());

CREATE POLICY "agents_insert_conversations" ON conversations
  FOR INSERT WITH CHECK (workspace_id = auth_agent_workspace_id());

CREATE POLICY "agents_update_conversations" ON conversations
  FOR UPDATE USING (workspace_id = auth_agent_workspace_id());

-- ---------- messages ----------
CREATE POLICY "agents_select_messages" ON messages
  FOR SELECT USING (workspace_id = auth_agent_workspace_id());

CREATE POLICY "agents_insert_messages" ON messages
  FOR INSERT WITH CHECK (
    workspace_id = auth_agent_workspace_id()
    AND sender_type = 'agent'
  );

-- ---------- canned_responses ----------
CREATE POLICY "agents_manage_canned" ON canned_responses
  FOR ALL USING (workspace_id = auth_agent_workspace_id());

-- ---------- tags ----------
CREATE POLICY "agents_manage_tags" ON tags
  FOR ALL USING (workspace_id = auth_agent_workspace_id());

-- ---------- conversation_tags ----------
CREATE POLICY "agents_manage_conv_tags" ON conversation_tags
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_tags.conversation_id
      AND c.workspace_id = auth_agent_workspace_id()
    )
  );

-- ---------- notifications ----------
CREATE POLICY "agents_own_notifications" ON notifications
  FOR ALL USING (agent_id = auth.uid());

-- ---------- widget_sessions ----------
CREATE POLICY "agents_select_sessions" ON widget_sessions
  FOR SELECT USING (workspace_id = auth_agent_workspace_id());
