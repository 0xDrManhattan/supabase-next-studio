import { useState, useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AnalyticsTrade } from '@/hooks/useAnalytics';

interface TradesTableProps {
  trades: AnalyticsTrade[];
  loading: boolean;
}

function bucketRsi(rsi: number | null): string {
  if (rsi == null) return 'unknown';
  if (rsi < 30) return 'OS';
  if (rsi < 40) return 'Low';
  if (rsi <= 60) return 'Neutral';
  if (rsi <= 70) return 'High';
  return 'OB';
}

function bucketVol(vol: number | null): string {
  if (vol == null) return '?';
  if (vol < 1) return 'Low';
  if (vol < 3) return 'Med';
  return 'High';
}

export function TradesTable({ trades, loading }: TradesTableProps) {
  const [symbolFilter, setSymbolFilter] = useState('');

  const filteredTrades = useMemo(() => {
    if (!symbolFilter) return trades;
    return trades.filter(t => t.symbol?.toLowerCase().includes(symbolFilter.toLowerCase()));
  }, [trades, symbolFilter]);

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(filteredTrades, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trades-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    const headers = ['date', 'symbol', 'direction', 'entry_price', 'exit_price', 'position_size', 'pnl', 'rr', 'mistake_flags', 'trend_at_entry', 'rsi_at_entry', 'volatility_at_entry'];
    const rows = filteredTrades.map(t => [
      t.exit_date || t.created_at,
      t.symbol || '',
      t.trade_type || '',
      t.entry_price ?? '',
      t.exit_price ?? '',
      t.position_size ?? '',
      t.pnl ?? '',
      t.rr ?? '',
      t.mistake_flags?.join(';') || '',
      t.trend_at_entry || '',
      t.rsi_at_entry ?? '',
      t.volatility_at_entry ?? '',
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trades-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="bg-card rounded-xl border border-border p-4 shadow-md animate-pulse">
        <div className="h-6 bg-muted rounded w-32 mb-4" />
        <div className="h-64 bg-muted rounded" />
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border p-4 shadow-md">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Trades</h3>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Filter by symbol..."
            value={symbolFilter}
            onChange={(e) => setSymbolFilter(e.target.value)}
            className="w-40 h-8 text-sm"
          />
          <Button variant="outline" size="sm" onClick={exportJSON} className="h-8">
            <Download className="h-3 w-3 mr-1" />
            JSON
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} className="h-8">
            <Download className="h-3 w-3 mr-1" />
            CSV
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto max-h-96">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs">Symbol</TableHead>
              <TableHead className="text-xs">Direction</TableHead>
              <TableHead className="text-xs text-right">RR</TableHead>
              <TableHead className="text-xs text-right">PnL</TableHead>
              <TableHead className="text-xs">Mistakes</TableHead>
              <TableHead className="text-xs">Environment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTrades.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No trades found
                </TableCell>
              </TableRow>
            ) : (
              filteredTrades.map((trade) => (
                <TableRow key={trade.id}>
                  <TableCell className="text-xs">
                    {(trade.exit_date || trade.created_at).split('T')[0]}
                  </TableCell>
                  <TableCell className="text-xs font-medium">{trade.symbol || '-'}</TableCell>
                  <TableCell className={cn('text-xs font-medium', trade.trade_type?.toLowerCase() === 'long' ? 'text-emerald-600' : 'text-red-600')}>
                    {trade.trade_type?.toUpperCase() || '-'}
                  </TableCell>
                  <TableCell className="text-xs text-right">
                    {trade.rr != null ? trade.rr.toFixed(2) : '-'}
                  </TableCell>
                  <TableCell className={cn('text-xs text-right font-medium', (trade.pnl ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                    {trade.pnl != null ? `$${trade.pnl.toFixed(2)}` : '-'}
                  </TableCell>
                  <TableCell>
                    {trade.mistake_flags && trade.mistake_flags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {trade.mistake_flags.slice(0, 2).map((flag, i) => (
                          <Badge key={i} variant="destructive" className="text-[10px] px-1 py-0">
                            {flag.replace(/_/g, ' ')}
                          </Badge>
                        ))}
                        {trade.mistake_flags.length > 2 && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            +{trade.mistake_flags.length - 2}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {trade.trend_at_entry || '?'} / {bucketRsi(trade.rsi_at_entry)} / {bucketVol(trade.volatility_at_entry)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
