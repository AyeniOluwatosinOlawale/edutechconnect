-- ============================================================
-- 0004_seed.sql — Dev seed data
-- ============================================================

-- Insert a demo workspace
INSERT INTO workspaces (id, name, widget_key, settings)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'EduTechConnect Demo',
  'wk_demo_edutechconnect',
  '{
    "brand_color": "#6366f1",
    "greeting_text": "Hi there! How can we help you today?",
    "offline_message": "We are currently offline. Leave a message and we will get back to you!",
    "widget_position": "bottom-right",
    "show_agent_names": true
  }'::jsonb
);

-- Note: Agent records are created after auth.users signup via Supabase Auth.
-- Use the Supabase dashboard or the invite flow in Settings > Agents to add agents.
