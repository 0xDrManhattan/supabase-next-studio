// supabase/functions/analytics-summary/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Trade = {
  id: string;
  user_id: string;
  symbol: string | null;
  trade_type: string | null; // "long" | "short"
  entry_price: number | null;
  exit_price: number | null;
  position_size: number | null;
  pnl: number | null;
  pnl_percent: number | null;
  rr: number | null;
  duration_minutes: number | null;
  rsi_at_entry: number | null;
  volatility_at_entry: number | null;
  trend_at_entry: string | null; // "bullish" | "bearish" | "neutral" | null
  mistake_flags: string[] | null;
  created_at: string;
  entry_date: string | null;
  exit_date: string | null;
};

function computePnl(t: Trade): number | null {
  if (typeof t.pnl === "number") return t.pnl;
  const { entry_price, exit_price, position_size, trade_type } = t;
  if (
    entry_price == null ||
    exit_price == null ||
    position_size == null ||
    !trade_type
  ) return null;

  const dir = trade_type.toLowerCase();
  if (dir !== "long" && dir !== "short") return null;

  const diff = dir === "long"
    ? (exit_price - entry_price)
    : (entry_price - exit_price);

  // ignore fees here – your modal already accounts for them; this is a fallback
  return diff * position_size;
}

function computeProfitFactor(trades: Trade[]): number | null {
  let grossWin = 0;
  let grossLoss = 0;

  for (const t of trades) {
    const p = computePnl(t);
    if (p == null) continue;
    if (p > 0) grossWin += p;
    if (p < 0) grossLoss += p;
  }

  if (grossWin === 0 && grossLoss === 0) return null;
  if (grossLoss === 0) return Infinity;

  return grossWin / Math.abs(grossLoss);
}

function computeWinRate(trades: Trade[]): number | null {
  let closed = 0;
  let wins = 0;

  for (const t of trades) {
    if (t.exit_price == null) continue;
    closed++;
    const p = computePnl(t);
    if (p != null && p > 0) wins++;
  }

  if (closed === 0) return null;
  return (wins / closed) * 100;
}

function computeAverageRR(trades: Trade[]): number | null {
  let sum = 0;
  let count = 0;
  for (const t of trades) {
    if (typeof t.rr === "number") {
      sum += t.rr;
      count++;
    }
  }
  if (count === 0) return null;
  return sum / count;
}

function computeStreaks(trades: Trade[]) {
  // sort by exit date (or created_at as fallback)
  const sorted = [...trades].sort((a, b) => {
    const da = a.exit_date || a.created_at;
    const db = b.exit_date || b.created_at;
    return new Date(da).getTime() - new Date(db).getTime();
  });

  let bestWinStreak = 0;
  let bestLossStreak = 0;
  let currentStreak = 0;
  let currentType: "win" | "loss" | null = null;

  for (const t of sorted) {
    if (t.exit_price == null) continue;
    const p = computePnl(t);
    if (p == null || p === 0) {
      // break streak on flat trades
      currentStreak = 0;
      currentType = null;
      continue;
    }

    const type: "win" | "loss" = p > 0 ? "win" : "loss";

    if (currentType === type || currentType === null) {
      currentStreak += 1;
      currentType = type;
    } else {
      // switching win -> loss or loss -> win
      if (currentType === "win") bestWinStreak = Math.max(bestWinStreak, currentStreak);
      if (currentType === "loss") bestLossStreak = Math.max(bestLossStreak, currentStreak);
      currentStreak = 1;
      currentType = type;
    }
  }

  // final flush
  if (currentType === "win") bestWinStreak = Math.max(bestWinStreak, currentStreak);
  if (currentType === "loss") bestLossStreak = Math.max(bestLossStreak, currentStreak);

  return {
    current_streak_count: currentStreak,
    current_streak_type: currentType, // "win" | "loss" | null
    best_win_streak: bestWinStreak,
    best_loss_streak: bestLossStreak,
  };
}

type EnvKey = string;

function bucketRsi(rsi: number | null): string {
  if (rsi == null) return "unknown";
  if (rsi < 30) return "oversold(<30)";
  if (rsi < 40) return "low(30–40)";
  if (rsi <= 60) return "neutral(40–60)";
  if (rsi <= 70) return "high(60–70)";
  return "overbought(>70)";
}

function bucketVol(vol: number | null): string {
  if (vol == null) return "unknown";
  if (vol < 1) return "low";
  if (vol < 3) return "medium";
  return "high";
}

function buildEnvironmentKey(t: Trade): EnvKey {
  const trend = t.trend_at_entry || "unknown";
  const rsiBucket = bucketRsi(t.rsi_at_entry);
  const volBucket = bucketVol(t.volatility_at_entry);
  return `${trend} | ${rsiBucket} | ${volBucket}`;
}

function computeBestEnvironment(trades: Trade[]) {
  const envBuckets = new Map<
    EnvKey,
    { trades: Trade[]; profit_factor: number | null }
  >();

  for (const t of trades) {
    const key = buildEnvironmentKey(t);
    if (!envBuckets.has(key)) {
      envBuckets.set(key, { trades: [], profit_factor: null });
    }
    envBuckets.get(key)!.trades.push(t);
  }

  let bestKey: EnvKey | null = null;
  let bestPF = 0;
  let bestCount = 0;

  for (const [key, bucket] of envBuckets.entries()) {
    // require minimum trades in bucket
    if (bucket.trades.length < 5) continue;
    const pf = computeProfitFactor(bucket.trades);
    if (pf == null || !isFinite(pf)) continue;
    if (pf > bestPF) {
      bestPF = pf;
      bestKey = key;
      bestCount = bucket.trades.length;
    }
  }

  if (!bestKey) return null;

  return {
    label: bestKey,
    profit_factor: bestPF,
    trade_count: bestCount,
  };
}

async function getUserAndDb(req: Request): Promise<{
  userId: string;
  supabaseDB: SupabaseClient;
} | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing auth" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabaseAuth = createClient(supabaseUrl, anonKey);
  const supabaseDB = createClient(supabaseUrl, serviceKey);

  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data.user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return { userId: data.user.id, supabaseDB };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const userOrRes = await getUserAndDb(req);
    if (userOrRes instanceof Response) return userOrRes;
    const { userId, supabaseDB } = userOrRes;

    const url = new URL(req.url);
    const from = url.searchParams.get("from"); // YYYY-MM-DD
    const to = url.searchParams.get("to");     // YYYY-MM-DD
    const status = url.searchParams.get("status"); // "open" | "closed" | null

    let query = supabaseDB
      .from("trades")
      .select("*")
      .eq("user_id", userId) as any;

    // Date filter on entry_date or created_at as fallback (simple for MVP)
    if (from) {
      const fromIso = new Date(from + "T00:00:00").toISOString();
      query = query.gte("created_at", fromIso);
    }
    if (to) {
      const toIso = new Date(to + "T23:59:59").toISOString();
      query = query.lte("created_at", toIso);
    }

    if (status === "open") {
      query = query.is("exit_price", null);
    } else if (status === "closed") {
      query = query.not("exit_price", "is", null);
    }

    const { data, error } = await query as { data: Trade[] | null; error: any };
    if (error) {
      console.error("DB error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const trades = data || [];
    const trade_count = trades.length;

    const net_pnl = trades.reduce((sum, t) => {
      const p = computePnl(t);
      return sum + (p ?? 0);
    }, 0);

    const profit_factor = computeProfitFactor(trades);
    const average_rr = computeAverageRR(trades);
    const win_rate = computeWinRate(trades);
    const streaks = computeStreaks(trades);
    const best_environment = computeBestEnvironment(trades);

    const payload = {
      trade_count,
      net_pnl,
      profit_factor,
      average_rr,
      win_rate,
      streaks,
      best_environment,
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analytics-summary error:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
