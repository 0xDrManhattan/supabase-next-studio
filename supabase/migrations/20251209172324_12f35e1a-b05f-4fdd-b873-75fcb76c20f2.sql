-- Add score fields for mark_on_enter and mark_on_exit
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS mark_on_enter_score integer,
  ADD COLUMN IF NOT EXISTS mark_on_exit_score integer;