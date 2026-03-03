-- Phase 11: Store AI-extracted commission configuration per agent
-- Run this migration in the Supabase SQL editor.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS agent_commission_config jsonb;

-- Example config shapes:
-- Flat rate:   { "type": "flat", "rate": 12 }
-- Tiered:      { "type": "tiered", "tiers": [{"upTo": 50000, "rate": 10}, {"rate": 15}] }
-- Per-category:{ "type": "category", "rates": {"CUBIX": 12, "CUTY": 10}, "default": 8 }
-- Complex:     { "type": "complex", "description": "...", "rules": [...] }
