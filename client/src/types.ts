export interface KpiData {
  label: string;
  value: string;
  subLabel?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  icon: string;
  color: 'blue' | 'green' | 'red' | 'violet' | 'amber' | 'slate';
}

export interface ModuleItem {
  id: string;
  title: string;
  description: string;
  icon: string;
  href: string;
  badge?: string | number;
}

export interface ModuleSection {
  id: string;
  title: string;
  subtitle?: string;
  color: 'blue' | 'violet' | 'amber' | 'emerald';
  modules: ModuleItem[];
}

export interface ExpenseCategory {
  key: string;
  label: string;
  amount: number;
  count: number;
  percentage: number;
  color: string;
}

export interface IncomeCategory {
  key: string;
  label: string;
  amount: number;
  percentage: number;
}

export interface DashboardFilters {
  from: string;
  to: string;
  platform: string;
}

export interface DashboardData {
  totalRevenue: number;
  totalExpenses: number;
  netBalance: number;
  bookingCount: number;
  pendingAlerts: number;
  recentBookings: BookingRow[];
}

export interface BookingRow {
  id: string;
  guestName: string;
  date: string;
  amount: number;
  platform: string;
  status: string;
}

export interface MonthlyDataPoint {
  month: string;
  ingresos: number;
  gastos: number;
}
