import { KPICard } from './KPICard';
import type { SummaryData } from '@/hooks/useAnalytics';

interface KPIRowProps {
  summary: SummaryData | null;
  loading: boolean;
}

export function KPIRow({ summary, loading }: KPIRowProps) {
  if (loading || !summary) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-4 shadow-md animate-pulse">
            <div className="h-4 bg-muted rounded w-20 mb-2" />
            <div className="h-8 bg-muted rounded w-24" />
          </div>
        ))}
      </div>
    );
  }

  const formatPnl = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPF = (value: number | null) => {
    if (value === null) return '-';
    if (!isFinite(value)) return '∞';
    return value.toFixed(2);
  };

  const formatRR = (value: number | null) => {
    if (value === null) return '-';
    return value.toFixed(2) + 'R';
  };

  const formatWinRate = (value: number | null) => {
    if (value === null) return '-';
    return value.toFixed(1) + '%';
  };

  const streakText = () => {
    const { current_streak_count, current_streak_type, best_win_streak, best_loss_streak } = summary.streaks;
    const current = current_streak_type
      ? `${current_streak_count} ${current_streak_type === 'win' ? 'W' : 'L'}`
      : '0';
    return current;
  };

  const bestStreakText = () => {
    const { best_win_streak, best_loss_streak } = summary.streaks;
    return `Best: ${best_win_streak}W / ${best_loss_streak}L`;
  };

  const bestEnvText = () => {
    if (!summary.best_environment) return 'Not enough data';
    return summary.best_environment.label;
  };

  const bestEnvSublabel = () => {
    if (!summary.best_environment) return undefined;
    return `PF: ${summary.best_environment.profit_factor.toFixed(2)} (${summary.best_environment.trade_count} trades)`;
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <KPICard
        title="Net PnL"
        value={formatPnl(summary.net_pnl)}
        valueColor={summary.net_pnl >= 0 ? 'profit' : 'loss'}
        sublabel={`${summary.trade_count} trades`}
      />
      <KPICard
        title="Profit Factor"
        value={formatPF(summary.profit_factor)}
        sublabel="Gross Win / Gross Loss"
      />
      <KPICard
        title="Average RR"
        value={formatRR(summary.average_rr)}
        sublabel="Reward to Risk"
      />
      <KPICard
        title="Win Rate"
        value={formatWinRate(summary.win_rate)}
        sublabel="Closed trades only"
      />
      <KPICard
        title="Streaks"
        value={streakText()}
        sublabel={bestStreakText()}
      />
      <KPICard
        title="Best Environment"
        value={bestEnvText()}
        sublabel={bestEnvSublabel()}
      />
    </div>
  );
}
