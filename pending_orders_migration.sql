-- Migration 1: Them cot sender_user_id vao bang pending_orders
ALTER TABLE pending_orders ADD COLUMN IF NOT EXISTS sender_user_id BIGINT;

-- Migration 2: Bang mapping Telegram ID <-> Dai ly (1 dai ly co nhieu nick)
CREATE TABLE IF NOT EXISTS agent_telegram_mappings (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  telegram_user_id BIGINT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_tg_map_tg_user ON agent_telegram_mappings(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_agent_tg_map_agent ON agent_telegram_mappings(agent_id);

-- Migration 3: Them cot gender cho dai ly ('male' / 'female' / null)
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(10) DEFAULT NULL;

