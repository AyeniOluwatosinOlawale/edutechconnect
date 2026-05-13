# EduTechConnect Live Chat — Setup Guide

## 1. Supabase Project

1. Create a new project at https://supabase.com/dashboard
2. In **SQL Editor**, run the migrations in order:
   - `supabase/migrations/0001_schema.sql`
   - `supabase/migrations/0002_rls.sql`
   - `supabase/migrations/0003_functions.sql`
   - `supabase/migrations/0004_seed.sql`
3. Enable **pg_cron** extension (Database → Extensions → search "pg_cron"), then run:
   ```sql
   SELECT cron.schedule('mark-inactive-sessions', '* * * * *', 'SELECT mark_inactive_sessions()');
   SELECT cron.schedule('mark-missed-conversations', '*/5 * * * *', 'SELECT mark_missed_conversations()');
   ```
4. Enable **Realtime** for tables: `conversations`, `messages`, `notifications`, `widget_sessions`
   (Database → Replication → Supabase Realtime → toggle each table)

## 2. Edge Functions

Install Supabase CLI:
```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

Set secrets:
```bash
supabase secrets set ZOHO_CLIENT_ID=...
supabase secrets set ZOHO_CLIENT_SECRET=...
supabase secrets set ZOHO_REFRESH_TOKEN=...
supabase secrets set WHATSAPP_TOKEN=...
supabase secrets set WHATSAPP_PHONE_NUMBER_ID=...
supabase secrets set RESEND_API_KEY=...
supabase secrets set DASHBOARD_URL=https://chat-admin.edutechconnect.org
```

Deploy:
```bash
supabase functions deploy widget-init
supabase functions deploy visitor-message
supabase functions deploy escalate-whatsapp
supabase functions deploy conversation-resolve
```

## 3. Environment Variables

Copy `.env.example` to `.env.local` in the repo root and fill in your values:
```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_WIDGET_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_WIDGET_SUPABASE_ANON_KEY=your-anon-key
VITE_WIDGET_FUNCTIONS_URL=https://YOUR_PROJECT.supabase.co/functions/v1
```

## 4. Build & Deploy

```bash
pnpm install
pnpm --filter @edu-chat/widget build    # → apps/widget/dist/widget.js
pnpm --filter @edu-chat/dashboard build # → apps/dashboard/dist/
```

Deploy to Vercel:
```bash
vercel deploy --prod
```

Set the following in Vercel project settings → Environment Variables:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_WIDGET_CDN_URL` = `https://your-vercel-domain.vercel.app`

## 5. Create First Agent

In Supabase SQL Editor:
```sql
-- After signing up via Supabase Auth dashboard (Authentication → Users → Invite user)
INSERT INTO agents (id, workspace_id, display_name, role, status)
VALUES (
  'THE_USER_UUID_FROM_AUTH',
  '00000000-0000-0000-0000-000000000001',  -- demo workspace
  'Your Name',
  'owner',
  'online'
);
```

## 6. Install Widget on a Website

Paste before `</body>` on any website:
```html
<script>
  window.EduChatConfig = { workspaceKey: "wk_demo_edutechconnect" };
</script>
<script async src="https://YOUR_VERCEL_DOMAIN/widget.js"></script>
```

Replace `wk_demo_edutechconnect` with your workspace's `widget_key` from the `workspaces` table.

## 7. Test Locally

```bash
pnpm --filter @edu-chat/dashboard dev   # http://localhost:5173
# open test.html in a browser to test the widget
```
