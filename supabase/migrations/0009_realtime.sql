-- Enable Supabase Realtime for tables that need live updates
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table conversations;
alter publication supabase_realtime add table notifications;
alter publication supabase_realtime add table conversation_ai_state;
