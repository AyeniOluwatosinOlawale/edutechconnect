-- Atomic increment for ai_reply_count (avoids read-modify-write race)
CREATE OR REPLACE FUNCTION increment_ai_reply_count(conv_id UUID)
RETURNS INT AS $$
  UPDATE conversations
  SET ai_reply_count = ai_reply_count + 1
  WHERE id = conv_id
  RETURNING ai_reply_count;
$$ LANGUAGE sql;
