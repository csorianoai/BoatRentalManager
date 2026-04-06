import type { DashboardData, MonthlyDataPoint } from '../types';

const BASE = '';

async function safeFetch<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${BASE}${url}`);
    if (!res.ok) return fallback;
    return await res.json();
  } catch {
    return fallback;
  }
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
}

export async function fetchDashboardData(filters: { from?: string; to?: string; platform?: string }): Promise<DashboardData> {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.platform && filters.platform !== 'Todas las plataformas') params.set('platform', filters.platform);

  const raw = await safeFetch<any>(`/api/dashboard-data?${params}`, null);

  if (!raw) {
    return {
      totalRevenue: 0,
      totalExpenses: 0,
      netBalance: 0,
      bookingCount: 0,
      pendingAlerts: 0,
      recentBookings: [],
    };
  }

  const totalRevenue = raw.revenue?.total ?? raw.totalRevenue ?? 0;
  const totalExpenses = raw.expenses?.total ?? raw.totalExpenses ?? 0;

  return {
    totalRevenue,
    totalExpenses,
    netBalance: totalRevenue - totalExpenses,
    bookingCount: raw.bookings?.count ?? raw.bookingCount ?? 0,
    pendingAlerts: raw.alerts?.pending ?? 0,
    recentBookings: raw.recentBookings ?? [],
  };
}

export async function fetchExpenseAnalysis(filters: { from?: string; to?: string }): Promise<{ categories: Array<{ key: string; label: string; amount: number; count: number }> }> {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);

  const data = await safeFetch<any>(`/api/accounting/analysis/expenses?${params}`, null);

  if (!data) return { categories: [] };

  const categories = (data.categories ?? data.groups ?? []).map((c: any) => ({
    key: c.key ?? c.category_key ?? '',
    label: c.label ?? c.name ?? c.key ?? '',
    amount: Number(c.amount ?? c.total ?? 0),
    count: Number(c.count ?? 0),
  }));

  return { categories };
}

export async function fetchIncomeAnalysis(filters: { from?: string; to?: string }): Promise<{ total: number; categories: Array<{ key: string; label: string; amount: number }> }> {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);

  const data = await safeFetch<any>(`/api/accounting/analysis/income?${params}`, null);

  if (!data) return { total: 0, categories: [] };

  const categories = (data.categories ?? data.groups ?? []).map((c: any) => ({
    key: c.key ?? c.category_key ?? '',
    label: c.label ?? c.name ?? '',
    amount: Number(c.amount ?? c.total ?? 0),
  }));

  return { total: data.total ?? 0, categories };
}

export async function fetchMonthlyTrend(): Promise<MonthlyDataPoint[]> {
  const data = await safeFetch<any>('/api/dashboard-data', null);
  if (!data?.monthlyRevenue) return [];

  return (data.monthlyRevenue as any[]).map((m: any) => ({
    month: m.month ?? '',
    ingresos: Number(m.revenue ?? m.ingresos ?? 0),
    gastos: Number(m.expenses ?? m.gastos ?? 0),
  }));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}
