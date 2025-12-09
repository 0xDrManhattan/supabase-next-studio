import { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import type { AnalyticsTrade } from '@/hooks/useAnalytics';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip);

interface MistakeFlagsProps {
  trades: AnalyticsTrade[];
  loading: boolean;
}

export function MistakeFlags({ trades, loading }: MistakeFlagsProps) {
  const stats = useMemo(() => {
    const tradesWithMistakes = trades.filter(t => t.mistake_flags && t.mistake_flags.length > 0);
    const percentage = trades.length > 0 ? (tradesWithMistakes.length / trades.length) * 100 : 0;

    const mistakeCounts: Record<string, number> = {};
    for (const trade of trades) {
      if (!trade.mistake_flags) continue;
      for (const flag of trade.mistake_flags) {
        mistakeCounts[flag] = (mistakeCounts[flag] || 0) + 1;
      }
    }

    const sorted = Object.entries(mistakeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      percentage,
      tradesWithMistakes: tradesWithMistakes.length,
      total: trades.length,
      topMistakes: sorted,
    };
  }, [trades]);

  const chartData = useMemo(() => {
    return {
      labels: stats.topMistakes.map(([label]) => label.replace(/_/g, ' ')),
      datasets: [
        {
          label: 'Count',
          data: stats.topMistakes.map(([, count]) => count),
          backgroundColor: 'hsl(0, 65%, 50%)',
          borderRadius: 4,
        },
      ],
    };
  }, [stats.topMistakes]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y' as const,
    plugins: {
      legend: { display: false },
    },
    scales: {
      x: {
        grid: { color: 'hsla(220, 10%, 50%, 0.1)' },
        ticks: { color: 'hsl(220, 10%, 50%)' },
      },
      y: {
        grid: { display: false },
        ticks: { color: 'hsl(220, 10%, 50%)' },
      },
    },
  };

  if (loading) {
    return (
      <div className="bg-card rounded-xl border border-border p-4 shadow-md animate-pulse">
        <div className="h-6 bg-muted rounded w-32 mb-4" />
        <div className="h-40 bg-muted rounded" />
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border p-4 shadow-md">
      <h3 className="text-sm font-semibold text-foreground mb-4">Mistake Analysis</h3>
      <div className="text-2xl font-bold text-red-600 mb-1">
        {stats.percentage.toFixed(1)}%
      </div>
      <div className="text-sm text-muted-foreground mb-4">
        {stats.tradesWithMistakes} of {stats.total} trades have mistakes
      </div>
      {stats.topMistakes.length > 0 ? (
        <div className="h-40">
          <Bar data={chartData} options={chartOptions} />
        </div>
      ) : (
        <div className="text-muted-foreground text-center py-8">No mistakes recorded</div>
      )}
    </div>
  );
}
