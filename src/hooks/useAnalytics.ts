import { useState, useCallback, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AnalyticsFilters = {
  from: string | null;
  to: string | null;
  status: "all" | "open" | "closed";
};

export type SummaryData = {
  trade_count: number;
  net_pnl: number;
  profit_factor: number | null;
  average_rr: number | null;
  win_rate: number | null;
  streaks: {
    current_streak_count: number;
    current_streak_type: "win" | "loss" | null;
    best_win_streak: number;
    best_loss_streak: number;
  };
  best_environment: {
    label: string;
    profit_factor: number;
    trade_count: number;
  } | null;
};

export type DistributionsData = {
  pnl_over_time: { date: string; daily_pnl: number; cumulative_pnl: number }[];
  rr_histogram: { label: string; count: number }[];
  win_loss_calendar: { date: string; wins: number; losses: number; breakeven: number }[];
};

export type EnvironmentsData = {
  trend_stats: {
    trend: string;
    trade_count: number;
    net_pnl: number;
    profit_factor: number | null;
    win_rate: number | null;
  }[];
  rsi_stats: {
    bucket: string;
    trade_count: number;
    net_pnl: number;
    profit_factor: number | null;
    win_rate: number | null;
  }[];
  volatility_stats: {
    bucket: string;
    trade_count: number;
    net_pnl: number;
    profit_factor: number | null;
    win_rate: number | null;
  }[];
  environment_clusters: {
    label: string;
    trade_count: number;
    net_pnl: number;
    profit_factor: number | null;
    win_rate: number | null;
  }[];
  best_environment: { label: string; profit_factor: number; trade_count: number } | null;
};

export type AnalyticsTrade = {
  id: string;
  symbol: string | null;
  trade_type: string | null;
  entry_price: number | null;
  exit_price: number | null;
  position_size: number | null;
  pnl: number | null;
  rr: number | null;
  trend_at_entry: string | null;
  rsi_at_entry: number | null;
  volatility_at_entry: number | null;
  mistake_flags: string[] | null;
  created_at: string;
  exit_date: string | null;
};

export function useAnalytics() {
  const { session } = useAuth();

  const [filters, setFilters] = useState<AnalyticsFilters>({
    from: null,
    to: null,
    status: "all",
  });

  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [distributions, setDistributions] = useState<DistributionsData | null>(null);
  const [environments, setEnvironments] = useState<EnvironmentsData | null>(null);
  const [trades, setTrades] = useState<AnalyticsTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stable query string based on filters
  const queryString = useMemo(() => {
    const params: Record<string, string> = {};
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;
    if (filters.status !== "all") params.status = filters.status;
    return new URLSearchParams(params).toString();
  }, [filters]);

  const fetchAnalytics = useCallback(async () => {
    if (!session?.access_token) return;

    setLoading(true);
    setError(null);

    const headers = { Authorization: `Bearer ${session.access_token}` };

    try {
      const [summaryRes, distRes, envRes] = await Promise.all([
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analytics-summary?${queryString}`, { headers }),
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analytics-distributions?${queryString}`, { headers }),
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analytics-environments?${queryString}`, { headers }),
      ]);

      if (!summaryRes.ok || !distRes.ok || !envRes.ok) {
        throw new Error("Failed to fetch analytics data");
      }

      const [summaryData, distData, envData] = await Promise.all([summaryRes.json(), distRes.json(), envRes.json()]);

      setSummary(summaryData);
      setDistributions(distData);
      setEnvironments(envData);

      let query = supabase
        .from("trades")
        .select(
          "id, symbol, trade_type, entry_price, exit_price, position_size, pnl, rr, trend_at_entry, rsi_at_entry, volatility_at_entry, mistake_flags, created_at, exit_date",
        )
        .order("created_at", { ascending: false });

      if (filters.from) {
        query = query.gte("created_at", new Date(filters.from + "T00:00:00").toISOString());
      }
      if (filters.to) {
        query = query.lte("created_at", new Date(filters.to + "T23:59:59").toISOString());
      }
      if (filters.status === "open") {
        query = query.is("exit_price", null);
      } else if (filters.status === "closed") {
        query = query.not("exit_price", "is", null);
      }

      const { data: tradesData, error: tradesError } = await query;
      if (tradesError) throw tradesError;

      setTrades(
        (tradesData || []).map((t) => ({
          ...t,
          mistake_flags: Array.isArray(t.mistake_flags) 
            ? (t.mistake_flags as unknown as string[]) 
            : null,
        })),
      );
    } catch (err) {
      console.error("Analytics fetch error:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, queryString]);

  useEffect(() => {
    if (session?.access_token) fetchAnalytics();
  }, [fetchAnalytics]);

  const setDatePreset = useCallback((preset: "7d" | "30d" | "90d" | "ytd" | "all") => {
    const today = new Date();
    let from: Date | null = null;

    switch (preset) {
      case "7d":
        from = new Date(today);
        from.setDate(from.getDate() - 7);
        break;
      case "30d":
        from = new Date(today);
        from.setDate(from.getDate() - 30);
        break;
      case "90d":
        from = new Date(today);
        from.setDate(from.getDate() - 90);
        break;
      case "ytd":
        from = new Date(today.getFullYear(), 0, 1);
        break;
      case "all":
        from = null;
        break;
    }

    setFilters((prev) => ({
      ...prev,
      from: from ? from.toISOString().split("T")[0] : null,
      to: preset === "all" ? null : today.toISOString().split("T")[0],
    }));
  }, []);

  return {
    filters,
    setFilters,
    setDatePreset,
    summary,
    distributions,
    environments,
    trades,
    loading,
    error,
    refetch: fetchAnalytics,
  };
}
