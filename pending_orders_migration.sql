-- Tạo bảng pending_orders để lưu đơn hàng chờ xác nhận từ Telegram bot
CREATE TABLE pending_orders (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  package_id INTEGER DEFAULT 0,
  package_name TEXT DEFAULT '',
  total_price INTEGER DEFAULT 0,
  vip_name TEXT DEFAULT '',
  vip_price INTEGER DEFAULT 0,
  notes TEXT DEFAULT '',
  group_chat_id BIGINT NOT NULL,
  group_message_id BIGINT NOT NULL,
  agent_telegram_name TEXT DEFAULT '',
  edit_state TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
