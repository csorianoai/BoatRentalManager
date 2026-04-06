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

export async function fetchDashboardData(filters: { from?: string; to?: string; platform?: string }): Promise<DashboardData> {
  const params = new URLSearchParams();
  if (filters.from && filters.to) {
    params.set('dateRange', 'custom');
    params.set('dateFrom', filters.from);
    params.set('dateTo', filters.to);
  }
  if (filters.platform && filters.platform !== 'Todas las plataformas') {
    params.set('platform', filters.platform);
  }

  const expenseParams = new URLSearchParams();
  if (filters.from) expenseParams.set('from', filters.from);
  if (filters.to) expenseParams.set('to', filters.to);

  const [raw, expRaw] = await Promise.all([
    safeFetch<any>(`/api/dashboard-data?${params}`, null),
    safeFetch<any>(`/api/accounting/expenses/analysis?${expenseParams}`, null),
  ]);

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

  const totalRevenue = Number(raw.period_revenue ?? raw.total_revenue ?? 0);
  const totalExpenses = Number(expRaw?.total_expenses ?? 0);

  const recentBookings = (raw.recent_bookings ?? []).map((b: any) => ({
    id: b.id ?? '',
    guestName: b.customer_name ?? '',
    date: b.booking_date ?? '',
    amount: Number(b.total_amount ?? 0),
    platform: b.platform ?? '',
    status: b.status ?? '',
  }));

  return {
    totalRevenue,
    totalExpenses,
    netBalance: totalRevenue - totalExpenses,
    bookingCount: Number(raw.period_bookings ?? raw.total_bookings ?? 0),
    pendingAlerts: 0,
    recentBookings,
  };
}

export async function fetchExpenseAnalysis(filters: { from?: string; to?: string }): Promise<{ categories: Array<{ key: string; label: string; amount: number; count: number }> }> {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);

  const data = await safeFetch<any>(`/api/accounting/expenses/analysis?${params}`, null);

  if (!data) return { categories: [] };

  const categories = (data.by_category ?? []).map((c: any) => ({
    key: c.category_key ?? '',
    label: c.name ?? c.category_key ?? '',
    amount: Number(c.total ?? 0),
    count: Number(c.count ?? 0),
  }));

  return { categories };
}

export async function fetchIncomeAnalysis(filters: { from?: string; to?: string }): Promise<{ total: number; categories: Array<{ key: string; label: string; amount: number }> }> {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);

  const data = await safeFetch<any>(`/api/accounting/income/analysis?${params}`, null);

  if (!data) return { total: 0, categories: [] };

  const categories = (data.by_category ?? []).map((c: any) => ({
    key: c.category_key ?? '',
    label: c.name ?? c.category_key ?? '',
    amount: Number(c.total ?? 0),
  }));

  return { total: Number(data.total_income ?? 0), categories };
}

export async function fetchMonthlyTrend(): Promise<MonthlyDataPoint[]> {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  const from = sixMonthsAgo.toISOString().slice(0, 10);
  const to = new Date().toISOString().slice(0, 10);

  const [incRaw, expRaw] = await Promise.all([
    safeFetch<any>(`/api/accounting/income/analysis?from=${from}&to=${to}`, null),
    safeFetch<any>(`/api/accounting/expenses/analysis?from=${from}&to=${to}`, null),
  ]);

  const incTrend: Record<string, number> = {};
  const expTrend: Record<string, number> = {};

  for (const row of (incRaw?.trend ?? [])) {
    incTrend[row.month] = Number(row.total ?? 0);
  }
  for (const row of (expRaw?.trend ?? [])) {
    expTrend[row.month] = Number(row.total ?? 0);
  }

  const allMonths = Array.from(new Set([...Object.keys(incTrend), ...Object.keys(expTrend)])).sort();

  if (allMonths.length === 0) return [];

  const MONTH_NAMES: Record<string, string> = {
    '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
    '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
    '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic',
  };

  return allMonths.map(m => {
    const [year, mon] = m.split('-');
    const label = `${MONTH_NAMES[mon] ?? mon} ${year.slice(2)}`;
    return {
      month: label,
      ingresos: incTrend[m] ?? 0,
      gastos: expTrend[m] ?? 0,
    };
  });
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}
