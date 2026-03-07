-- Migration 1: Them cot sender_user_id vao bang pending_orders
ALTER TABLE pending_orders ADD COLUMN IF NOT EXISTS sender_user_id BIGINT;

-- Migration 2: Them cot telegram_user_id vao bang users (de luu nick Telegram cua dai ly)
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_user_id BIGINT;
