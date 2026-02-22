-- ═══════════════════════════════════════════════════════════════
-- DRAFTS TABLE - Auto-save OrderForm progress by company name
-- ═══════════════════════════════════════════════════════════════

-- Create drafts table
CREATE TABLE IF NOT EXISTS drafts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  company_name TEXT NOT NULL,
  form_state JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS drafts_user_company_idx ON drafts(user_id, company_name);

-- Enable RLS
ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;

-- Users can only see their own drafts
CREATE POLICY "Users can view own drafts"
  ON drafts FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own drafts
CREATE POLICY "Users can insert own drafts"
  ON drafts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own drafts
CREATE POLICY "Users can update own drafts"
  ON drafts FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own drafts
CREATE POLICY "Users can delete own drafts"
  ON drafts FOR DELETE
  USING (auth.uid() = user_id);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_drafts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS drafts_updated_at ON drafts;
CREATE TRIGGER drafts_updated_at
  BEFORE UPDATE ON drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_drafts_updated_at();
