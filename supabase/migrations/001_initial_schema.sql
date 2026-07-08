-- WorkflowAI 数据库迁移
-- 创建基础表结构

-- 1. 会话/对话表
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  customer_name TEXT,
  contact_method TEXT,
  contact_value TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. 对话消息表
CREATE TABLE IF NOT EXISTS conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('customer', 'ai', 'owner', 'system')),
  text TEXT NOT NULL,
  channel TEXT DEFAULT 'website_widget',
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. 预订表
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id),
  service_type TEXT,
  pickup_location TEXT,
  dropoff_location TEXT,
  airport TEXT,
  terminal TEXT,
  date TEXT,
  time TEXT,
  flight_number TEXT,
  passenger_count INT,
  luggage_count INT,
  vehicle_preference TEXT,
  special_requests TEXT[],
  route_distance_km NUMERIC,
  estimated_drive_time_min INT,
  approved_price NUMERIC,
  currency TEXT DEFAULT 'USD',
  included_fees TEXT[],
  payment_method TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'completed', 'cancelled')),
  driver_name TEXT,
  driver_phone TEXT,
  driver_vehicle TEXT,
  driver_color TEXT,
  driver_license_plate TEXT,
  driver_whatsapp TEXT,
  receipt_needed BOOLEAN DEFAULT FALSE,
  receipt_name TEXT,
  special_notes TEXT[],
  confirmation_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. 老板审批表
CREATE TABLE IF NOT EXISTS boss_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id),
  booking_id UUID REFERENCES bookings(id),
  type TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'edited', 'rejected')),
  customer_name TEXT,
  summary TEXT,
  recommendation TEXT,
  reason TEXT,
  confidence INT,
  decision_type TEXT,
  event_type TEXT,
  severity TEXT CHECK (severity IN ('low', 'medium', 'high')),
  suggested_price NUMERIC,
  currency TEXT DEFAULT 'USD',
  vehicle_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. 业务配置表
CREATE TABLE IF NOT EXISTS business_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  company_name TEXT NOT NULL DEFAULT '天桥机场接送',
  config JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON conversation_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_bookings_conversation ON bookings(conversation_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_boss_inbox_status ON boss_inbox(status);
CREATE INDEX IF NOT EXISTS idx_boss_inbox_conversation ON boss_inbox(conversation_id);
