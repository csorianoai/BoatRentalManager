import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import Header from '../components/dashboard/Header';
import KpiGrid from '../components/dashboard/KpiGrid';
import ModulesGrid from '../components/dashboard/ModulesGrid';
import FinancialPanel from '../components/dashboard/FinancialPanel';
import { fetchDashboardData } from '../lib/api';
import type { DashboardFilters } from '../types';
import { AlertTriangle } from 'lucide-react';

function getDefaultFilters(): DashboardFilters {
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const to = today.toISOString().slice(0, 10);
  return { from, to, platform: 'Todas las plataformas' };
}

function ErrorBanner() {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
      <p className="text-sm text-amber-800">
        No se pudo conectar con el servidor. Mostrando estado vacío. Verifica que el backend esté activo.
      </p>
    </div>
  );
}

export default function DashboardPage() {
  const [filters, setFilters] = useState<DashboardFilters>(getDefaultFilters);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard-data', filters.from, filters.to, filters.platform],
    queryFn: () => fetchDashboardData(filters),
    placeholderData: (prev: any) => prev,
  });

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <Header filters={filters} onFiltersChange={setFilters} />

      <main className="max-w-screen-2xl mx-auto px-6 py-8 flex flex-col gap-8">
        {/* Section label */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-gray-900">Resumen Ejecutivo</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {filters.from} — {filters.to}
                {filters.platform !== 'Todas las plataformas' && ` · ${filters.platform}`}
              </p>
            </div>
          </div>

          {isError && <ErrorBanner />}

          <KpiGrid data={data} isLoading={isLoading} />
        </div>

        {/* Module Hub */}
        <ModulesGrid />

        {/* Financial Intelligence */}
        <FinancialPanel
          filters={filters}
          totalRevenue={data?.totalRevenue ?? 0}
          totalExpenses={data?.totalExpenses ?? 0}
        />

        {/* Footer */}
        <footer className="text-center py-4 border-t border-gray-100">
          <p className="text-[11px] text-gray-400">
            Nadaki Excursions Portal · gestion.nadakiexcursions.com
            <span className="mx-2">·</span>
            <a href="/dashboard.html" className="text-brand-600 hover:underline">Dashboard Clásico</a>
          </p>
        </footer>
      </main>
    </div>
  );
}
