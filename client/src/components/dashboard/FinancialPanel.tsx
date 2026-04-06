import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, TrendingDown, Scale, ChevronRight, AlertCircle, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchExpenseAnalysis, fetchIncomeAnalysis, fetchMonthlyTrend, formatCurrency } from '../../lib/api';
import { EXPENSE_CATEGORIES } from '../../data/modules';
import type { DashboardFilters } from '../../types';

interface FinancialPanelProps {
  filters: DashboardFilters;
  totalRevenue: number;
  totalExpenses: number;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2">
      <AlertCircle className="w-8 h-8 text-gray-300" />
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-10">
      <Loader2 className="w-6 h-6 text-gray-300 animate-spin" />
    </div>
  );
}

function CategoryBar({ label, amount, total, color, count }: { label: string; amount: number; total: number; color: string; count: number }) {
  const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
  return (
    <div className="group cursor-pointer hover:bg-gray-50 rounded-lg px-2 py-1.5 -mx-2 transition-colors">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12px] font-medium text-gray-700 truncate max-w-[160px]">{label}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[11px] text-gray-400">{count} mov.</span>
          <span className="text-[12px] font-semibold text-gray-900 tabular-nums">{formatCurrency(amount)}</span>
        </div>
      </div>
      <div className="relative h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function ExpenseBreakdownCard({ filters }: { filters: DashboardFilters }) {
  const { data, isLoading } = useQuery({
    queryKey: ['expenses-analysis', filters.from, filters.to],
    queryFn: () => fetchExpenseAnalysis({ from: filters.from, to: filters.to }),
  });

  const categories = data?.categories ?? [];
  const total = categories.reduce((s, c) => s + c.amount, 0);

  const enriched = categories
    .filter(c => c.amount > 0)
    .map(c => {
      const meta = EXPENSE_CATEGORIES.find(e => e.key === c.key);
      return {
        ...c,
        label: meta?.label ?? c.label,
        color: meta?.color ?? '#94a3b8',
      };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 12);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-card flex flex-col h-full">
      <div className="px-5 pt-5 pb-3 border-b border-gray-50 flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-bold text-gray-900">Análisis de Gastos</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">Top categorías del período</p>
        </div>
        <a
          href="/accounting.html#gastos"
          className="flex items-center gap-1 text-[11px] text-brand-600 font-medium hover:text-brand-700 transition-colors"
        >
          Ver todo <ChevronRight className="w-3 h-3" />
        </a>
      </div>
      <div className="p-4 flex-1 overflow-y-auto">
        {isLoading ? (
          <LoadingState />
        ) : enriched.length === 0 ? (
          <EmptyState message="Sin datos de gastos para este período" />
        ) : (
          <div className="flex flex-col gap-0.5">
            {enriched.map(cat => (
              <CategoryBar
                key={cat.key}
                label={cat.label}
                amount={cat.amount}
                total={total}
                color={cat.color}
                count={cat.count}
              />
            ))}
          </div>
        )}
      </div>
      {total > 0 && (
        <div className="px-5 py-3 border-t border-gray-50 flex items-center justify-between">
          <span className="text-[11px] text-gray-400">Total gastos</span>
          <span className="text-[13px] font-bold text-gray-900 tabular-nums">{formatCurrency(total)}</span>
        </div>
      )}
    </div>
  );
}

function TrendChart({ filters }: { filters: DashboardFilters }) {
  const { data: points = [], isLoading } = useQuery({
    queryKey: ['monthly-trend'],
    queryFn: fetchMonthlyTrend,
  });

  const MONTHS_ES: Record<string, string> = {
    Jan: 'Ene', Feb: 'Feb', Mar: 'Mar', Apr: 'Abr', May: 'May', Jun: 'Jun',
    Jul: 'Jul', Aug: 'Ago', Sep: 'Sep', Oct: 'Oct', Nov: 'Nov', Dec: 'Dic',
  };

  const chartData = points.map(p => ({
    ...p,
    month: MONTHS_ES[p.month] ?? p.month,
  }));

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-card flex flex-col h-full">
      <div className="px-5 pt-5 pb-3 border-b border-gray-50 flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-bold text-gray-900">Tendencia Mensual</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">Ingresos vs Gastos — últimos 6 meses</p>
        </div>
        <a
          href="/executive.html"
          className="flex items-center gap-1 text-[11px] text-brand-600 font-medium hover:text-brand-700 transition-colors"
        >
          Ejecutivo <ChevronRight className="w-3 h-3" />
        </a>
      </div>
      <div className="p-4 flex-1">
        {isLoading ? (
          <LoadingState />
        ) : chartData.length === 0 ? (
          <EmptyState message="Sin datos de tendencia disponibles" />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(v: number, name: string) => [formatCurrency(v), name === 'ingresos' ? 'Ingresos' : 'Gastos']}
                labelStyle={{ fontSize: 12, color: '#374151' }}
                contentStyle={{ border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 12 }}
              />
              <Legend
                formatter={v => v === 'ingresos' ? 'Ingresos' : 'Gastos'}
                wrapperStyle={{ fontSize: 11, color: '#6b7280', paddingTop: 8 }}
              />
              <Bar dataKey="ingresos" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={32} />
              <Bar dataKey="gastos" fill="#f87171" radius={[4, 4, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ revenue, expenses }: { revenue: number; expenses: number }) {
  const net = revenue - expenses;
  const isPositive = net >= 0;
  const pctExpenses = revenue > 0 ? (expenses / revenue) * 100 : 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-5 flex flex-col gap-4">
      <div>
        <h3 className="text-[14px] font-bold text-gray-900">Resumen Financiero</h3>
        <p className="text-[11px] text-gray-400 mt-0.5">Balance del período seleccionado</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-emerald-50 p-3.5">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-[10px] font-medium text-emerald-700 uppercase tracking-wide">Ingresos</span>
          </div>
          <span className="text-[18px] font-bold text-emerald-700 tabular-nums">{formatCurrency(revenue)}</span>
        </div>
        <div className="rounded-xl bg-red-50 p-3.5">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingDown className="w-3.5 h-3.5 text-red-500" />
            <span className="text-[10px] font-medium text-red-600 uppercase tracking-wide">Gastos</span>
          </div>
          <span className="text-[18px] font-bold text-red-600 tabular-nums">{formatCurrency(expenses)}</span>
        </div>
      </div>

      <div className="relative">
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-red-400 rounded-full transition-all duration-700"
            style={{ width: `${Math.min(pctExpenses, 100)}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-gray-400">Ratio de gastos sobre ingresos</span>
          <span className="text-[10px] font-semibold text-gray-600">{pctExpenses.toFixed(1)}%</span>
        </div>
      </div>

      <div className={`rounded-xl p-4 flex items-center gap-3 ${isPositive ? 'bg-brand-50' : 'bg-orange-50'}`}>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${isPositive ? 'bg-brand-100' : 'bg-orange-100'}`}>
          <Scale className={`w-4.5 h-4.5 w-[18px] h-[18px] ${isPositive ? 'text-brand-600' : 'text-orange-600'}`} />
        </div>
        <div>
          <p className={`text-[10px] font-medium uppercase tracking-wide ${isPositive ? 'text-brand-700' : 'text-orange-700'}`}>
            Balance Neto
          </p>
          <p className={`text-xl font-bold tabular-nums ${isPositive ? 'text-brand-700' : 'text-orange-700'}`}>
            {formatCurrency(net)}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function FinancialPanel({ filters, totalRevenue, totalExpenses }: FinancialPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-bold text-gray-900">Inteligencia Financiera</h2>
        <p className="text-xs text-gray-400 mt-0.5">Análisis de gastos, ingresos y tendencias del período</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-1">
          <SummaryCard revenue={totalRevenue} expenses={totalExpenses} />
        </div>
        <div className="lg:col-span-1 min-h-[320px]">
          <ExpenseBreakdownCard filters={filters} />
        </div>
        <div className="lg:col-span-1 min-h-[320px]">
          <TrendChart filters={filters} />
        </div>
      </div>
    </div>
  );
}
