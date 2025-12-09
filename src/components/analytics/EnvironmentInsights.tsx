import type { EnvironmentsData } from '@/hooks/useAnalytics';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface EnvironmentInsightsProps {
  environments: EnvironmentsData | null;
  loading: boolean;
}

function StatsTable({
  title,
  data,
  labelKey,
}: {
  title: string;
  data: { trade_count: number; net_pnl: number; profit_factor: number | null; win_rate: number | null }[] & Record<string, any>[];
  labelKey: string;
}) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border p-4 shadow-md">
        <h3 className="text-sm font-semibold text-foreground mb-4">{title}</h3>
        <div className="text-muted-foreground text-center py-4">No data</div>
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

  const formatWR = (value: number | null) => {
    if (value === null) return '-';
    return value.toFixed(1) + '%';
  };

  return (
    <div className="bg-card rounded-xl border border-border p-4 shadow-md overflow-hidden">
      <h3 className="text-sm font-semibold text-foreground mb-4">{title}</h3>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">{title.split(' ')[0]}</TableHead>
              <TableHead className="text-xs text-right">Trades</TableHead>
              <TableHead className="text-xs text-right">Net PnL</TableHead>
              <TableHead className="text-xs text-right">PF</TableHead>
              <TableHead className="text-xs text-right">Win Rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, i) => (
              <TableRow key={i}>
                <TableCell className="text-xs font-medium">{row[labelKey]}</TableCell>
                <TableCell className="text-xs text-right">{row.trade_count}</TableCell>
                <TableCell className={cn('text-xs text-right', row.net_pnl >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                  {formatPnl(row.net_pnl)}
                </TableCell>
                <TableCell className="text-xs text-right">{formatPF(row.profit_factor)}</TableCell>
                <TableCell className="text-xs text-right">{formatWR(row.win_rate)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function EnvironmentInsights({ environments, loading }: EnvironmentInsightsProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Environment Insights</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-4 shadow-md animate-pulse h-48" />
          ))}
        </div>
      </div>
    );
  }

  if (!environments) {
    return null;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">Environment Insights</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatsTable title="Trend Performance" data={environments.trend_stats} labelKey="trend" />
        <StatsTable title="RSI Buckets" data={environments.rsi_stats} labelKey="bucket" />
        <StatsTable title="Volatility Buckets" data={environments.volatility_stats} labelKey="bucket" />
      </div>
      {environments.best_environment && (
        <div className="bg-gradient-to-r from-emerald-500/10 to-emerald-600/5 rounded-xl border border-emerald-500/20 p-4 shadow-md">
          <h3 className="text-sm font-semibold text-emerald-600 mb-2">Best Environment</h3>
          <div className="text-lg font-bold text-foreground">{environments.best_environment.label}</div>
          <div className="text-sm text-muted-foreground mt-1">
            Profit Factor: {environments.best_environment.profit_factor.toFixed(2)} • {environments.best_environment.trade_count} trades
          </div>
        </div>
      )}
    </div>
  );
}
