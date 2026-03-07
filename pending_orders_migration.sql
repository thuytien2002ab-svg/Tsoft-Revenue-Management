-- Migration 1: Them cot sender_user_id vao bang pending_orders
ALTER TABLE pending_orders ADD COLUMN IF NOT EXISTS sender_user_id BIGINT;

-- Migration 2 (MỚI - thay the telegram_user_id tren users):
-- Tao bang mapping rieng: 1 dai ly co the co nhieu nick Telegram
CREATE TABLE IF NOT EXISTS agent_telegram_mappings (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  telegram_user_id BIGINT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index de query nhanh
CREATE INDEX IF NOT EXISTS idx_agent_tg_map_tg_user ON agent_telegram_mappings(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_agent_tg_map_agent ON agent_telegram_mappings(agent_id);

-- (Tuỳ chọn) Xoa cot cu neu da chay migration truoc do
-- ALTER TABLE users DROP COLUMN IF EXISTS telegram_user_id;
