import {
  Calendar, Ship, Anchor, Wrench, MessageSquare, BookOpen,
  TrendingDown, TrendingUp, GitMerge, BarChart3, Landmark,
  Sparkles, Zap, Tag, Percent, Wind, FileText, Package,
  Users, LucideIcon, ExternalLink
} from 'lucide-react';
import type { ModuleSection, ModuleItem } from '../../types';
import { MODULE_SECTIONS } from '../../data/modules';

const ICON_MAP: Record<string, LucideIcon> = {
  Calendar, Ship, Anchor, Wrench, MessageSquare, BookOpen,
  TrendingDown, TrendingUp, GitMerge, BarChart3, Landmark,
  Sparkles, Zap, Tag, Percent, Wind, FileText, Package, Users,
};

const SECTION_COLORS: Record<string, { border: string; dot: string; badge: string; icon: string }> = {
  blue:    { border: 'border-t-brand-500',   dot: 'bg-brand-500',   badge: 'bg-brand-50 text-brand-700',   icon: 'bg-brand-50 text-brand-600' },
  violet:  { border: 'border-t-violet-500',  dot: 'bg-violet-500',  badge: 'bg-violet-50 text-violet-700', icon: 'bg-violet-50 text-violet-600' },
  amber:   { border: 'border-t-amber-500',   dot: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700',   icon: 'bg-amber-50 text-amber-600' },
  emerald: { border: 'border-t-emerald-500', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700', icon: 'bg-emerald-50 text-emerald-600' },
};

function ModuleCard({ module: mod, sectionColor }: { module: ModuleItem; sectionColor: string }) {
  const Icon = ICON_MAP[mod.icon] ?? FileText;
  const c = SECTION_COLORS[sectionColor];

  return (
    <a
      href={mod.href}
      data-testid={`module-card-${mod.id}`}
      className="group bg-white rounded-xl border border-gray-100 p-4 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200 flex flex-col gap-3 cursor-pointer"
    >
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-lg ${c.icon} flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform`}>
          <Icon className="w-4.5 h-4.5 w-[18px] h-[18px]" />
        </div>
        {mod.badge && (
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${c.badge}`}>
            {mod.badge}
          </span>
        )}
        <ExternalLink className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-400 transition-colors ml-auto" />
      </div>
      <div>
        <h3 className="text-[13px] font-semibold text-gray-900 leading-snug">{mod.title}</h3>
        <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed line-clamp-2">{mod.description}</p>
      </div>
    </a>
  );
}

function SectionBlock({ section }: { section: ModuleSection }) {
  const c = SECTION_COLORS[section.color];
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-card overflow-hidden`}>
      <div className={`border-t-[3px] ${c.border} px-5 pt-4 pb-3 border-b border-gray-50`}>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${c.dot} flex-shrink-0`} />
          <h2 className="text-[13px] font-bold text-gray-900 tracking-tight">{section.title}</h2>
          <span className="text-[11px] text-gray-400 ml-1">{section.subtitle}</span>
        </div>
      </div>
      <div className="p-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
        {section.modules.map(mod => (
          <ModuleCard key={mod.id} module={mod} sectionColor={section.color} />
        ))}
      </div>
    </div>
  );
}

export default function ModulesGrid() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900">Centro de Control</h2>
          <p className="text-xs text-gray-400 mt-0.5">Acceso rápido a todos los módulos del sistema</p>
        </div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {MODULE_SECTIONS.map(section => (
          <SectionBlock key={section.id} section={section} />
        ))}
      </div>
    </div>
  );
}
