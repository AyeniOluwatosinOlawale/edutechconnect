-- Add Telegram channel support to conversations

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'widget',
  ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;

-- Index for quick lookup of open Telegram conversations
CREATE INDEX IF NOT EXISTS idx_conversations_telegram
  ON conversations(telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL;

-- Update the escalated status comment (cosmetic, no change needed)
-- source values: 'widget' | 'telegram'
