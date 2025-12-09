import { cn } from '@/lib/utils';

interface KPICardProps {
  title: string;
  value: string | number;
  sublabel?: string;
  valueColor?: 'default' | 'profit' | 'loss';
}

export function KPICard({ title, value, sublabel, valueColor = 'default' }: KPICardProps) {
  return (
    <div className="bg-card rounded-xl border border-border p-4 shadow-md hover:shadow-lg transition-shadow">
      <div className="text-sm font-medium text-muted-foreground mb-1">{title}</div>
      <div
        className={cn(
          'text-2xl font-bold tracking-tight',
          valueColor === 'profit' && 'text-emerald-600',
          valueColor === 'loss' && 'text-red-600',
          valueColor === 'default' && 'text-foreground'
        )}
      >
        {value}
      </div>
      {sublabel && (
        <div className="text-xs text-muted-foreground mt-1">{sublabel}</div>
      )}
    </div>
  );
}
