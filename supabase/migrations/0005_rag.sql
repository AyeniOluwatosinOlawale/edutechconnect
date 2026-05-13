-- ============================================================
-- 0005_rag.sql — RAG knowledge base + AI state tracking
-- ============================================================

-- Enable pgvector (may already be enabled in Supabase; safe to re-run)
CREATE EXTENSION IF NOT EXISTS vector;

-- ---- Knowledge Base Documents (source records) ------------
CREATE TYPE kb_source_type AS ENUM ('faq', 'pdf', 'url', 'transcript');
CREATE TYPE kb_doc_status   AS ENUM ('pending', 'processing', 'ready', 'error');

CREATE TABLE kb_documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_type    kb_source_type NOT NULL,
  title          TEXT NOT NULL,
  source_ref     TEXT,  -- PDF path | URL | conversation_id for transcript
  status         kb_doc_status NOT NULL DEFAULT 'pending',
  error_message  TEXT,
  chunk_count    INT NOT NULL DEFAULT 0,
  created_by     UUID REFERENCES agents(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_kb_documents_workspace ON kb_documents(workspace_id, source_type);

-- ---- Knowledge Base Chunks (text units with vector embeddings) --
CREATE TABLE kb_chunks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id  UUID NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  chunk_index  INT NOT NULL DEFAULT 0,
  content      TEXT NOT NULL,
  embedding    vector(1536),  -- text-embedding-3-small output dimension
  token_count  INT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_kb_chunks_document ON kb_chunks(document_id);
CREATE INDEX idx_kb_chunks_workspace ON kb_chunks(workspace_id);

-- IVFFlat approximate nearest-neighbour index (cosine distance)
-- VACUUM ANALYZE kb_chunks after inserting first batch of embeddings
CREATE INDEX idx_kb_chunks_embedding ON kb_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ---- Per-conversation AI handoff state --------------------
CREATE TYPE ai_handoff_reason AS ENUM (
  'low_confidence',
  'visitor_requested',
  'agent_takeover'
);

CREATE TABLE conversation_ai_state (
  conversation_id UUID PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  is_bot_active   BOOLEAN NOT NULL DEFAULT true,
  handoff_reason  ai_handoff_reason,
  handed_off_at   TIMESTAMPTZ,
  last_chunk_ids  UUID[],
  last_top_score  FLOAT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- RAG query log (analytics + debugging) ----------------
CREATE TABLE rag_query_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  conversation_id  UUID REFERENCES conversations(id) ON DELETE CASCADE,
  visitor_message  TEXT NOT NULL,
  top_score        FLOAT,
  chunk_ids_used   UUID[],
  llm_prompt_tokens  INT,
  llm_reply_tokens   INT,
  reply_generated  TEXT,
  was_escalated    BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rag_log_workspace ON rag_query_log(workspace_id, created_at DESC);

-- ---- Extend conversations table ---------------------------
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS ai_handled     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_reply_count INT     NOT NULL DEFAULT 0;

-- ---- updated_at triggers ----------------------------------
CREATE TRIGGER trg_kb_documents_updated_at
  BEFORE UPDATE ON kb_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_conv_ai_state_updated_at
  BEFORE UPDATE ON conversation_ai_state
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---- RLS --------------------------------------------------
ALTER TABLE kb_documents          ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_chunks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_ai_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_query_log         ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agents_manage_kb_docs" ON kb_documents
  FOR ALL USING (workspace_id = auth_agent_workspace_id());

CREATE POLICY "agents_select_kb_chunks" ON kb_chunks
  FOR SELECT USING (workspace_id = auth_agent_workspace_id());

CREATE POLICY "agents_select_ai_state" ON conversation_ai_state
  FOR SELECT USING (workspace_id = auth_agent_workspace_id());

CREATE POLICY "agents_update_ai_state" ON conversation_ai_state
  FOR UPDATE USING (workspace_id = auth_agent_workspace_id());

CREATE POLICY "agents_select_rag_log" ON rag_query_log
  FOR SELECT USING (workspace_id = auth_agent_workspace_id());

-- ---- Vector similarity search function --------------------
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding  vector(1536),
  p_workspace_id   UUID,
  match_threshold  FLOAT DEFAULT 0.75,
  match_count      INT   DEFAULT 4
)
RETURNS TABLE (
  id          UUID,
  document_id UUID,
  content     TEXT,
  similarity  FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    kc.id,
    kc.document_id,
    kc.content,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM kb_chunks kc
  WHERE kc.workspace_id = p_workspace_id
    AND kc.embedding IS NOT NULL
    AND 1 - (kc.embedding <=> query_embedding) >= match_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
$$;
