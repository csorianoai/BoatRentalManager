import { useState } from 'react';
import { Download, FileText, Search, ChevronDown } from 'lucide-react';
import type { DashboardFilters } from '../../types';
import { PLATFORMS } from '../../data/modules';

interface HeaderProps {
  filters: DashboardFilters;
  onFiltersChange: (f: DashboardFilters) => void;
}

export default function Header({ filters, onFiltersChange }: HeaderProps) {
  const [platformOpen, setPlatformOpen] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';

  function handleExport(type: 'pdf' | 'excel') {
    window.location.href = `/api/export-dashboard?type=${type}&from=${filters.from}&to=${filters.to}`;
  }

  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
      <div className="max-w-screen-2xl mx-auto px-6 py-4">
        <div className="flex items-center gap-6 flex-wrap">
          {/* Branding */}
          <div className="flex items-center gap-3 mr-auto">
            <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center shadow-sm flex-shrink-0">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 17l9-9 4 4 5-7"/>
                <path d="M21 17H3"/>
              </svg>
            </div>
            <div>
              <h1 className="text-[15px] font-semibold text-gray-900 leading-none">Nadaki Excursions</h1>
              <p className="text-[11px] text-gray-400 mt-0.5 leading-none">Centro de Control</p>
            </div>
          </div>

          {/* Date Range */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-400 text-xs font-medium">Desde</span>
            <input
              type="date"
              value={filters.from}
              max={filters.to}
              data-testid="input-filter-from"
              onChange={e => onFiltersChange({ ...filters, from: e.target.value })}
              className="h-8 px-3 rounded-lg border border-gray-200 text-sm text-gray-700 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-colors"
            />
            <span className="text-gray-400 text-xs font-medium">Hasta</span>
            <input
              type="date"
              value={filters.to}
              min={filters.from}
              data-testid="input-filter-to"
              onChange={e => onFiltersChange({ ...filters, to: e.target.value })}
              className="h-8 px-3 rounded-lg border border-gray-200 text-sm text-gray-700 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-colors"
            />
          </div>

          {/* Platform Selector */}
          <div className="relative">
            <button
              onClick={() => setPlatformOpen(v => !v)}
              data-testid="button-platform-selector"
              className="h-8 px-3 rounded-lg border border-gray-200 text-sm text-gray-700 bg-gray-50 flex items-center gap-2 hover:border-gray-300 hover:bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              <span className="max-w-[140px] truncate">{filters.platform}</span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            </button>
            {platformOpen && (
              <div className="absolute right-0 top-10 w-52 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
                {PLATFORMS.map(p => (
                  <button
                    key={p}
                    onClick={() => { onFiltersChange({ ...filters, platform: p }); setPlatformOpen(false); }}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors hover:bg-gray-50 ${p === filters.platform ? 'text-brand-600 font-medium' : 'text-gray-700'}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <a
              href="/dashboard.html"
              className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 bg-gray-50 flex items-center gap-1.5 hover:bg-white hover:border-gray-300 transition-colors"
              data-testid="link-classic-dashboard"
              title="Ir al dashboard clásico"
            >
              Dashboard Clásico
            </a>
            <button
              onClick={() => handleExport('pdf')}
              data-testid="button-export-pdf"
              className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 bg-gray-50 flex items-center gap-1.5 hover:bg-white hover:border-gray-300 transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              PDF
            </button>
            <button
              onClick={() => handleExport('excel')}
              data-testid="button-export-excel"
              className="h-8 px-3 rounded-lg bg-brand-600 text-xs font-medium text-white flex items-center gap-1.5 hover:bg-brand-700 transition-colors shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              Excel
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
