import { TrendingUp, TrendingDown, BarChart3, Calendar, AlertTriangle, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import type { DashboardData } from '../../types';
import { formatCurrency } from '../../lib/api';

interface KpiGridProps {
  data: DashboardData | undefined;
  isLoading: boolean;
}

function KpiCard({
  label,
  value,
  subLabel,
  icon: Icon,
  trend,
  trendValue,
  accent,
  isLoading,
}: {
  label: string;
  value: string;
  subLabel?: string;
  icon: React.ElementType;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  accent: string;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-card animate-pulse">
        <div className="h-3 w-24 bg-gray-100 rounded mb-3" />
        <div className="h-7 w-32 bg-gray-100 rounded mb-2" />
        <div className="h-3 w-20 bg-gray-100 rounded" />
      </div>
    );
  }

  const TrendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Minus;
  const trendColor = trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-500' : 'text-gray-400';

  return (
    <div
      data-testid={`kpi-card-${label.toLowerCase().replace(/\s+/g, '-')}`}
      className="bg-white rounded-2xl p-5 border border-gray-100 shadow-card hover:shadow-card-hover transition-all duration-200 group"
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
        <div className={`w-8 h-8 rounded-lg ${accent} flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
      <div className="mb-1">
        <span className="text-[26px] font-bold text-gray-900 tracking-tight tabular-nums leading-none">{value}</span>
      </div>
      {(subLabel || trendValue) && (
        <div className="flex items-center gap-1.5 mt-1.5">
          {trendValue && (
            <span className={`flex items-center gap-0.5 text-xs font-medium ${trendColor}`}>
              <TrendIcon className="w-3 h-3" />
              {trendValue}
            </span>
          )}
          {subLabel && <span className="text-xs text-gray-400">{subLabel}</span>}
        </div>
      )}
    </div>
  );
}

export default function KpiGrid({ data, isLoading }: KpiGridProps) {
  const net = data ? data.netBalance : 0;
  const netTrend = net > 0 ? 'up' : net < 0 ? 'down' : 'neutral';

  const kpis = [
    {
      label: 'Total Ingresos',
      value: data ? formatCurrency(data.totalRevenue) : '$0',
      subLabel: 'período seleccionado',
      icon: TrendingUp,
      accent: 'bg-emerald-500',
      trend: 'up' as const,
    },
    {
      label: 'Total Gastos',
      value: data ? formatCurrency(data.totalExpenses) : '$0',
      subLabel: 'período seleccionado',
      icon: TrendingDown,
      accent: 'bg-red-500',
      trend: data && data.totalExpenses > 0 ? ('down' as const) : ('neutral' as const),
    },
    {
      label: 'Balance Neto',
      value: data ? formatCurrency(data.netBalance) : '$0',
      subLabel: net >= 0 ? 'superávit' : 'déficit',
      icon: BarChart3,
      accent: net >= 0 ? 'bg-brand-600' : 'bg-orange-500',
      trend: netTrend,
    },
    {
      label: 'Reservas',
      value: data ? data.bookingCount.toString() : '0',
      subLabel: 'en el período',
      icon: Calendar,
      accent: 'bg-violet-500',
    },
    {
      label: 'Alertas Pendientes',
      value: data ? data.pendingAlerts.toString() : '0',
      subLabel: 'requieren atención',
      icon: AlertTriangle,
      accent: data?.pendingAlerts ? 'bg-amber-500' : 'bg-gray-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {kpis.map(kpi => (
        <KpiCard
          key={kpi.label}
          label={kpi.label}
          value={kpi.value}
          subLabel={kpi.subLabel}
          icon={kpi.icon}
          accent={kpi.accent}
          trend={(kpi as any).trend}
          isLoading={isLoading}
        />
      ))}
    </div>
  );
}
