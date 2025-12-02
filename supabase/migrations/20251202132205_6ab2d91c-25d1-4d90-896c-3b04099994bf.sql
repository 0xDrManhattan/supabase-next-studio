-- Create trades table
CREATE TABLE public.trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  symbol TEXT NOT NULL,
  entry_price DECIMAL(18, 8),
  exit_price DECIMAL(18, 8),
  quantity DECIMAL(18, 8),
  trade_type TEXT CHECK (trade_type IN ('long', 'short')),
  entry_date TIMESTAMPTZ,
  exit_date TIMESTAMPTZ,
  pnl DECIMAL(18, 8),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create ideas table
CREATE TABLE public.ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  symbol TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create market_thoughts table
CREATE TABLE public.market_thoughts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  sentiment TEXT CHECK (sentiment IN ('bullish', 'bearish', 'neutral')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create diary table
CREATE TABLE public.diary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  mood TEXT,
  date DATE DEFAULT CURRENT_DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS on all tables
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_thoughts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diary ENABLE ROW LEVEL SECURITY;

-- RLS policies for trades
CREATE POLICY "Users can view their own trades" ON public.trades FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own trades" ON public.trades FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own trades" ON public.trades FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own trades" ON public.trades FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for ideas
CREATE POLICY "Users can view their own ideas" ON public.ideas FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own ideas" ON public.ideas FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own ideas" ON public.ideas FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own ideas" ON public.ideas FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for market_thoughts
CREATE POLICY "Users can view their own market_thoughts" ON public.market_thoughts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own market_thoughts" ON public.market_thoughts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own market_thoughts" ON public.market_thoughts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own market_thoughts" ON public.market_thoughts FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for diary
CREATE POLICY "Users can view their own diary" ON public.diary FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own diary" ON public.diary FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own diary" ON public.diary FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own diary" ON public.diary FOR DELETE USING (auth.uid() = user_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_trades_updated_at BEFORE UPDATE ON public.trades FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ideas_updated_at BEFORE UPDATE ON public.ideas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_market_thoughts_updated_at BEFORE UPDATE ON public.market_thoughts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_diary_updated_at BEFORE UPDATE ON public.diary FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();