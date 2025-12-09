import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AnalyticsFilters as Filters } from '@/hooks/useAnalytics';

interface AnalyticsFiltersProps {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  setDatePreset: (preset: '7d' | '30d' | '90d' | 'ytd' | 'all') => void;
}

export function AnalyticsFilters({ filters, setFilters, setDatePreset }: AnalyticsFiltersProps) {
  return (
    <div className="bg-card rounded-xl border border-border p-4 shadow-md">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-muted-foreground">From</label>
          <Input
            type="date"
            value={filters.from || ''}
            onChange={(e) => setFilters(prev => ({ ...prev, from: e.target.value || null }))}
            className="w-40"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-muted-foreground">To</label>
          <Input
            type="date"
            value={filters.to || ''}
            onChange={(e) => setFilters(prev => ({ ...prev, to: e.target.value || null }))}
            className="w-40"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-muted-foreground">Status</label>
          <Select
            value={filters.status}
            onValueChange={(v) => setFilters(prev => ({ ...prev, status: v as Filters['status'] }))}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1 ml-auto">
          {(['7d', '30d', '90d', 'ytd', 'all'] as const).map((preset) => (
            <Button
              key={preset}
              variant="ghost"
              size="sm"
              onClick={() => setDatePreset(preset)}
              className="text-xs uppercase"
            >
              {preset === 'all' ? 'All' : preset.toUpperCase()}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
