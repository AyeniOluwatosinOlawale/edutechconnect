-- ============================================================
-- 0007_auto_agent.sql
-- Auto-create agent row when a new user signs up via Supabase Auth.
-- Also creates the first workspace if none exists.
-- ============================================================

-- Function called by auth trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_workspace_id UUID;
BEGIN
  -- Use the demo workspace if it exists, otherwise create one
  SELECT id INTO v_workspace_id FROM workspaces LIMIT 1;

  IF v_workspace_id IS NULL THEN
    INSERT INTO workspaces (name, widget_key, settings)
    VALUES (
      'My Workspace',
      'wk_' || replace(gen_random_uuid()::text, '-', ''),
      '{
        "brand_color": "#6366f1",
        "greeting_text": "Hi there! How can we help you today?",
        "widget_position": "bottom-right",
        "show_agent_names": true
      }'::jsonb
    )
    RETURNING id INTO v_workspace_id;
  END IF;

  -- Insert agent row (ignore if already exists)
  INSERT INTO public.agents (id, workspace_id, display_name, role, status)
  VALUES (
    NEW.id,
    v_workspace_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'owner',
    'online'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Retroactively create agent rows for existing auth users ──
-- This runs once during migration for any auth users that don't have an agent row.
DO $$
DECLARE
  v_workspace_id UUID;
  rec RECORD;
BEGIN
  SELECT id INTO v_workspace_id FROM workspaces LIMIT 1;

  IF v_workspace_id IS NULL THEN
    RETURN;
  END IF;

  FOR rec IN
    SELECT u.id, u.email, u.raw_user_meta_data
    FROM auth.users u
    LEFT JOIN public.agents a ON a.id = u.id
    WHERE a.id IS NULL
  LOOP
    INSERT INTO public.agents (id, workspace_id, display_name, role, status)
    VALUES (
      rec.id,
      v_workspace_id,
      COALESCE(rec.raw_user_meta_data->>'full_name', split_part(rec.email, '@', 1)),
      'owner',
      'online'
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END;
$$;
