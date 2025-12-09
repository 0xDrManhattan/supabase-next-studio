import { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import type { DistributionsData } from '@/hooks/useAnalytics';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface PerformanceChartsProps {
  distributions: DistributionsData | null;
  loading: boolean;
}

export function PerformanceCharts({ distributions, loading }: PerformanceChartsProps) {
  const pnlChartData = useMemo(() => {
    if (!distributions) return null;
    return {
      labels: distributions.pnl_over_time.map(d => d.date),
      datasets: [
        {
          label: 'Cumulative PnL',
          data: distributions.pnl_over_time.map(d => d.cumulative_pnl),
          borderColor: 'hsl(160, 60%, 45%)',
          backgroundColor: 'hsla(160, 60%, 45%, 0.1)',
          fill: true,
          tension: 0.3,
        },
      ],
    };
  }, [distributions]);

  const rrHistogramData = useMemo(() => {
    if (!distributions) return null;
    return {
      labels: distributions.rr_histogram.map(d => d.label),
      datasets: [
        {
          label: 'Trade Count',
          data: distributions.rr_histogram.map(d => d.count),
          backgroundColor: distributions.rr_histogram.map((d, i) => {
            const label = d.label;
            if (label.includes('-') && !label.includes('0')) return 'hsl(0, 65%, 50%)';
            if (label === '0 – 1' || label === '-1 – 0') return 'hsl(220, 10%, 50%)';
            return 'hsl(160, 60%, 45%)';
          }),
          borderRadius: 4,
        },
      ],
    };
  }, [distributions]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      x: {
        grid: { color: 'hsla(220, 10%, 50%, 0.1)' },
        ticks: { color: 'hsl(220, 10%, 50%)' },
      },
      y: {
        grid: { color: 'hsla(220, 10%, 50%, 0.1)' },
        ticks: { color: 'hsl(220, 10%, 50%)' },
      },
    },
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-4 shadow-md h-72 animate-pulse">
            <div className="h-6 bg-muted rounded w-32 mb-4" />
            <div className="h-full bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-card rounded-xl border border-border p-4 shadow-md">
        <h3 className="text-sm font-semibold text-foreground mb-4">PnL Over Time</h3>
        <div className="h-64">
          {pnlChartData && pnlChartData.labels.length > 0 ? (
            <Line data={pnlChartData} options={chartOptions} />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              No data available
            </div>
          )}
        </div>
      </div>
      <div className="bg-card rounded-xl border border-border p-4 shadow-md">
        <h3 className="text-sm font-semibold text-foreground mb-4">RR Distribution</h3>
        <div className="h-64">
          {rrHistogramData && rrHistogramData.datasets[0].data.some(v => v > 0) ? (
            <Bar data={rrHistogramData} options={chartOptions} />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              No data available
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
