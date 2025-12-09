// supabase/functions/analytics-distributions/index.ts
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

    // ---------- PnL over time (daily cumulative) ----------
    const dailyMap = new Map<string, number>();

    for (const t of trades) {
      const p = computePnl(t);
      if (p == null) continue;
      const keyDate = (t.exit_date || t.created_at).slice(0, 10); // YYYY-MM-DD
      dailyMap.set(keyDate, (dailyMap.get(keyDate) || 0) + p);
    }

    const dailySorted = Array.from(dailyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]));

    const pnl_over_time: { date: string; daily_pnl: number; cumulative_pnl: number }[] = [];
    let cumulative = 0;
    for (const [date, daily] of dailySorted) {
      cumulative += daily;
      pnl_over_time.push({ date, daily_pnl: daily, cumulative_pnl: cumulative });
    }

    // ---------- RR histogram ----------
    const bins = [
      { label: "< -5", from: -Infinity, to: -5 },
      { label: "-5 – -3", from: -5, to: -3 },
      { label: "-3 – -2", from: -3, to: -2 },
      { label: "-2 – -1", from: -2, to: -1 },
      { label: "-1 – 0", from: -1, to: 0 },
      { label: "0 – 1", from: 0, to: 1 },
      { label: "1 – 2", from: 1, to: 2 },
      { label: "2 – 3", from: 2, to: 3 },
      { label: "3 – 5", from: 3, to: 5 },
      { label: "> 5", from: 5, to: Infinity },
    ];

    const rr_histogram = bins.map((b) => ({
      label: b.label,
      count: 0,
    }));

    for (const t of trades) {
      if (t.rr == null) continue;
      for (let i = 0; i < bins.length; i++) {
        const b = bins[i];
        if (t.rr >= b.from && t.rr < b.to) {
          rr_histogram[i].count += 1;
          break;
        }
      }
    }

    // ---------- Win/loss calendar ----------
    const calendarMap = new Map<string, { wins: number; losses: number; breakeven: number }>();

    for (const t of trades) {
      if (t.exit_price == null) continue;
      const p = computePnl(t);
      if (p == null) continue;
      const key = (t.exit_date || t.created_at).slice(0, 10);
      if (!calendarMap.has(key)) {
        calendarMap.set(key, { wins: 0, losses: 0, breakeven: 0 });
      }
      const bucket = calendarMap.get(key)!;
      if (p > 0) bucket.wins += 1;
      else if (p < 0) bucket.losses += 1;
      else bucket.breakeven += 1;
    }

    const win_loss_calendar = Array.from(calendarMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, counts]) => ({
        date,
        ...counts,
      }));

    const payload = {
      pnl_over_time,
      rr_histogram,
      win_loss_calendar,
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analytics-distributions error:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
