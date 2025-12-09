// supabase/functions/analytics-environments/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Trade = {
  id: string;
  user_id: string;
  trade_type: string | null;
  entry_price: number | null;
  exit_price: number | null;
  position_size: number | null;
  pnl: number | null;
  rr: number | null;
  rsi_at_entry: number | null;
  volatility_at_entry: number | null;
  trend_at_entry: string | null;
  created_at: string;
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

type EnvKey = string;

function buildEnvKey(t: Trade): EnvKey {
  const trend = t.trend_at_entry || "unknown";
  const rsiBucket = bucketRsi(t.rsi_at_entry);
  const volBucket = bucketVol(t.volatility_at_entry);
  return `${trend} | ${rsiBucket} | ${volBucket}`;
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

    // ---------- Trend stats ----------
    const trendBuckets = new Map<string, Trade[]>();
    for (const t of trades) {
      const key = t.trend_at_entry || "unknown";
      if (!trendBuckets.has(key)) trendBuckets.set(key, []);
      trendBuckets.get(key)!.push(t);
    }

    const trend_stats = Array.from(trendBuckets.entries()).map(([trend, list]) => ({
      trend,
      trade_count: list.length,
      net_pnl: list.reduce((s, t) => s + (computePnl(t) ?? 0), 0),
      profit_factor: computeProfitFactor(list),
      win_rate: computeWinRate(list),
    }));

    // ---------- RSI stats ----------
    const rsiBuckets = new Map<string, Trade[]>();
    for (const t of trades) {
      const key = bucketRsi(t.rsi_at_entry);
      if (!rsiBuckets.has(key)) rsiBuckets.set(key, []);
      rsiBuckets.get(key)!.push(t);
    }

    const rsi_stats = Array.from(rsiBuckets.entries()).map(([bucket, list]) => ({
      bucket,
      trade_count: list.length,
      net_pnl: list.reduce((s, t) => s + (computePnl(t) ?? 0), 0),
      profit_factor: computeProfitFactor(list),
      win_rate: computeWinRate(list),
    }));

    // ---------- Volatility stats ----------
    const volBuckets = new Map<string, Trade[]>();
    for (const t of trades) {
      const key = bucketVol(t.volatility_at_entry);
      if (!volBuckets.has(key)) volBuckets.set(key, []);
      volBuckets.get(key)!.push(t);
    }

    const volatility_stats = Array.from(volBuckets.entries()).map(([bucket, list]) => ({
      bucket,
      trade_count: list.length,
      net_pnl: list.reduce((s, t) => s + (computePnl(t) ?? 0), 0),
      profit_factor: computeProfitFactor(list),
      win_rate: computeWinRate(list),
    }));

    // ---------- Environment clusters ----------
    const envBuckets = new Map<EnvKey, Trade[]>();
    for (const t of trades) {
      const key = buildEnvKey(t);
      if (!envBuckets.has(key)) envBuckets.set(key, []);
      envBuckets.get(key)!.push(t);
    }

    const environment_clusters = Array.from(envBuckets.entries()).map(([key, list]) => ({
      label: key,
      trade_count: list.length,
      net_pnl: list.reduce((s, t) => s + (computePnl(t) ?? 0), 0),
      profit_factor: computeProfitFactor(list),
      win_rate: computeWinRate(list),
    }));

    // ---------- Best environment ----------
    let bestEnv: { label: string; profit_factor: number; trade_count: number } | null = null;
    for (const cluster of environment_clusters) {
      const pf = cluster.profit_factor;
      if (pf == null || !isFinite(pf)) continue;
      if (cluster.trade_count < 5) continue; // min sample size
      if (!bestEnv || pf > bestEnv.profit_factor) {
        bestEnv = {
          label: cluster.label,
          profit_factor: pf,
          trade_count: cluster.trade_count,
        };
      }
    }

    const payload = {
      trend_stats,
      rsi_stats,
      volatility_stats,
      environment_clusters,
      best_environment: bestEnv,
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analytics-environments error:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
