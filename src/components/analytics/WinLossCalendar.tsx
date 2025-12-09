import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { DistributionsData } from '@/hooks/useAnalytics';

interface WinLossCalendarProps {
  distributions: DistributionsData | null;
  loading: boolean;
}

export function WinLossCalendar({ distributions, loading }: WinLossCalendarProps) {
  const calendarData = useMemo(() => {
    if (!distributions) return [];
    return distributions.win_loss_calendar;
  }, [distributions]);

  if (loading) {
    return (
      <div className="bg-card rounded-xl border border-border p-4 shadow-md animate-pulse">
        <div className="h-6 bg-muted rounded w-40 mb-4" />
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: 30 }).map((_, i) => (
            <div key={i} className="w-6 h-6 bg-muted rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (calendarData.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border p-4 shadow-md">
        <h3 className="text-sm font-semibold text-foreground mb-4">Win/Loss Calendar</h3>
        <div className="text-muted-foreground text-center py-8">No data available</div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border p-4 shadow-md">
      <h3 className="text-sm font-semibold text-foreground mb-4">Win/Loss Calendar</h3>
      <div className="flex flex-wrap gap-1">
        {calendarData.map((day) => {
          const isWin = day.wins > day.losses;
          const isLoss = day.losses > day.wins;
          const isNeutral = !isWin && !isLoss;

          return (
            <div
              key={day.date}
              className={cn(
                'w-6 h-6 rounded text-[10px] flex items-center justify-center font-medium cursor-default',
                isWin && 'bg-emerald-500/20 text-emerald-600 border border-emerald-500/30',
                isLoss && 'bg-red-500/20 text-red-600 border border-red-500/30',
                isNeutral && 'bg-muted text-muted-foreground border border-border'
              )}
              title={`${day.date}: ${day.wins}W / ${day.losses}L / ${day.breakeven}BE`}
            >
              {day.wins + day.losses + day.breakeven}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-emerald-500/20 border border-emerald-500/30" />
          <span>Win day</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-red-500/20 border border-red-500/30" />
          <span>Loss day</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-muted border border-border" />
          <span>Neutral</span>
        </div>
      </div>
    </div>
  );
}
