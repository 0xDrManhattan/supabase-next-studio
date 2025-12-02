-- Add new columns to trades table
ALTER TABLE public.trades 
ADD COLUMN IF NOT EXISTS trade_number SERIAL,
ADD COLUMN IF NOT EXISTS position_size numeric,
ADD COLUMN IF NOT EXISTS notional_value numeric,
ADD COLUMN IF NOT EXISTS stop_loss numeric,
ADD COLUMN IF NOT EXISTS take_profit numeric,
ADD COLUMN IF NOT EXISTS fees numeric,
ADD COLUMN IF NOT EXISTS pnl_percent numeric,
ADD COLUMN IF NOT EXISTS notes_on_enter text,
ADD COLUMN IF NOT EXISTS mark_on_enter text,
ADD COLUMN IF NOT EXISTS notes_on_exit text,
ADD COLUMN IF NOT EXISTS mark_on_exit text;

-- Rename quantity to position_size if it exists (handle gracefully)
-- Actually, let's keep quantity as an alias and use position_size
-- The position_size column was just added above

-- Add comment to clarify direction column
COMMENT ON COLUMN public.trades.trade_type IS 'Direction: long or short';