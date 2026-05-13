-- ============================================================
-- 0001_schema.sql — Core tables
-- ============================================================

-- Workspaces (one per account / embeddable widget)
CREATE TABLE workspaces (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  widget_key    TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  plan          TEXT NOT NULL DEFAULT 'free',
  settings      JSONB NOT NULL DEFAULT '{}',
  -- settings keys: brand_color, greeting_text, offline_message,
  --   widget_position, show_agent_names, zoho_refresh_token,
  --   zoho_access_token, zoho_token_expires_at
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agents (extends auth.users)
CREATE TABLE agents (
  id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  display_name      TEXT NOT NULL,
  avatar_url        TEXT,
  role              TEXT NOT NULL DEFAULT 'agent',  -- agent | admin | owner
  status            TEXT NOT NULL DEFAULT 'offline', -- online | busy | offline
  status_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Visitors (anonymous website visitors, identified by visitor_token in localStorage)
CREATE TABLE visitors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            TEXT,
  email           TEXT,
  phone           TEXT,
  ip_address      INET,
  country_code    TEXT,
  city            TEXT,
  user_agent      TEXT,
  browser         TEXT,
  os              TEXT,
  device_type     TEXT,  -- desktop | mobile | tablet
  current_url     TEXT,
  referrer        TEXT,
  zoho_lead_id    TEXT,
  whatsapp_number TEXT,
  -- Persistent token stored in visitor's localStorage
  visitor_token   TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Conversation status enum
CREATE TYPE conversation_status AS ENUM (
  'waiting',    -- visitor sent first message, no agent assigned yet
  'active',     -- an agent is in the conversation
  'resolved',   -- agent closed it
  'missed',     -- visitor left before agent responded
  'escalated'   -- escalated to WhatsApp
);

-- Conversations (one chat session)
CREATE TABLE conversations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  visitor_id            UUID NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  assigned_agent_id     UUID REFERENCES agents(id) ON DELETE SET NULL,
  status                conversation_status NOT NULL DEFAULT 'waiting',
  subject               TEXT,
  started_url           TEXT,
  started_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_response_at     TIMESTAMPTZ,
  resolved_at           TIMESTAMPTZ,
  zoho_lead_id          TEXT,
  csat_score            SMALLINT CHECK (csat_score BETWEEN 1 AND 5),
  csat_comment          TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversations_workspace_status ON conversations(workspace_id, status);
CREATE INDEX idx_conversations_visitor ON conversations(visitor_id);
CREATE INDEX idx_conversations_agent ON conversations(assigned_agent_id);

-- Message types
CREATE TYPE message_sender_type AS ENUM ('visitor', 'agent', 'system', 'bot');
CREATE TYPE message_content_type AS ENUM ('text', 'image', 'file', 'system_event');

-- Messages
CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  sender_type     message_sender_type NOT NULL,
  sender_id       UUID,
  sender_name     TEXT,
  content_type    message_content_type NOT NULL DEFAULT 'text',
  content         TEXT,
  file_url        TEXT,
  file_name       TEXT,
  file_size_bytes BIGINT,
  delivered_at    TIMESTAMPTZ,
  read_at         TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX idx_messages_workspace ON messages(workspace_id, created_at DESC);
-- Full-text search on message content
CREATE INDEX idx_messages_fts ON messages USING gin(to_tsvector('english', coalesce(content, '')));

-- Canned responses
CREATE TABLE canned_responses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  shortcut      TEXT NOT NULL,
  title         TEXT NOT NULL,
  content       TEXT NOT NULL,
  created_by    UUID REFERENCES agents(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, shortcut)
);

-- Tags
CREATE TABLE tags (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  color         TEXT NOT NULL DEFAULT '#6366f1',
  UNIQUE(workspace_id, name)
);

CREATE TABLE conversation_tags (
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  tag_id          UUID REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (conversation_id, tag_id)
);

-- Agent in-app notifications
CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,  -- new_conversation | new_message | assignment | escalation
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  message         TEXT NOT NULL,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_agent ON notifications(agent_id, read_at);

-- Widget sessions (live visitor tracking — heartbeat every 30s from widget)
CREATE TABLE widget_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  visitor_id    UUID NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  current_url   TEXT,
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_widget_sessions_workspace ON widget_sessions(workspace_id, is_active);
