import Navigation from '@/components/Navigation';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useAnalytics } from '@/hooks/useAnalytics';
import { AnalyticsFilters } from '@/components/analytics/AnalyticsFilters';
import { KPIRow } from '@/components/analytics/KPIRow';
import { PerformanceCharts } from '@/components/analytics/PerformanceCharts';
import { WinLossCalendar } from '@/components/analytics/WinLossCalendar';
import { EnvironmentInsights } from '@/components/analytics/EnvironmentInsights';
import { MistakeFlags } from '@/components/analytics/MistakeFlags';
import { TradesTable } from '@/components/analytics/TradesTable';

const Analytics = () => {
  const {
    filters,
    setFilters,
    setDatePreset,
    summary,
    distributions,
    environments,
    trades,
    loading,
    error,
  } = useAnalytics();

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Analytics Dashboard</h1>
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive border border-destructive/20 rounded-xl p-4">
            Error loading analytics: {error}
          </div>
        )}

        <AnalyticsFilters filters={filters} setFilters={setFilters} setDatePreset={setDatePreset} />
        <KPIRow summary={summary} loading={loading} />
        <PerformanceCharts distributions={distributions} loading={loading} />
        <WinLossCalendar distributions={distributions} loading={loading} />
        <EnvironmentInsights environments={environments} loading={loading} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1">
            <MistakeFlags trades={trades} loading={loading} />
          </div>
          <div className="lg:col-span-2">
            <TradesTable trades={trades} loading={loading} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Analytics;
