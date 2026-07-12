-- WorkflowAI 多租户迁移
-- 引入 companies 表（注册账号），并让业务表归属到具体公司

CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE boss_inbox ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

-- business_config previously used a fixed 'default' primary key shared by
-- every install. Under multi-tenancy each company needs its own row, so the
-- id column must generate a fresh value per insert instead of the same
-- literal every time.
ALTER TABLE business_config ALTER COLUMN id SET DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS idx_conversations_company ON conversations(company_id);
CREATE INDEX IF NOT EXISTS idx_bookings_company ON bookings(company_id);
CREATE INDEX IF NOT EXISTS idx_boss_inbox_company ON boss_inbox(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_business_config_company ON business_config(company_id);
