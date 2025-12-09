-- Add new analytical fields to trades table
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS duration_minutes integer,
  ADD COLUMN IF NOT EXISTS rr numeric,
  ADD COLUMN IF NOT EXISTS rsi_at_entry numeric,
  ADD COLUMN IF NOT EXISTS volatility_at_entry numeric,
  ADD COLUMN IF NOT EXISTS trend_at_entry text,
  ADD COLUMN IF NOT EXISTS notes_before text,
  ADD COLUMN IF NOT EXISTS notes_after text,
  ADD COLUMN IF NOT EXISTS mistake_flags jsonb DEFAULT '[]'::jsonb;