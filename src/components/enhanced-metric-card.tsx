import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { AnimatedCounter } from './animated-counter';
import { cn } from '@/lib/utils';

interface EnhancedMetricCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  index: number;
  trend?: {
    value: number;
    label: string;
  };
  prefix?: string;
  suffix?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}

const variantColors = {
  default: 'text-primary bg-primary/10',
  success: 'text-green-600 dark:text-green-400 bg-green-500/10',
  warning: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
  danger: 'text-red-600 dark:text-red-400 bg-red-500/10',
};

export function EnhancedMetricCard({
  title,
  value,
  icon: Icon,
  index,
  trend,
  prefix = '',
  suffix = '',
  variant = 'default',
}: EnhancedMetricCardProps) {
  const getTrendIcon = () => {
    if (!trend) return null;
    if (trend.value > 0) return TrendingUp;
    if (trend.value < 0) return TrendingDown;
    return Minus;
  };

  const TrendIcon = getTrendIcon();
  const trendColor = trend 
    ? trend.value > 0 
      ? 'text-green-600 dark:text-green-400' 
      : trend.value < 0 
        ? 'text-red-600 dark:text-red-400' 
        : 'text-muted-foreground'
    : '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
    >
      <Card className="hover-elevate active-elevate-2 transition-all duration-300 overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground mb-2">
                {title}
              </p>
              <div className="flex items-baseline gap-2">
                <h3 className="text-3xl font-bold tracking-tight">
                  {typeof value === 'number' ? (
                    <AnimatedCounter 
                      value={value} 
                      prefix={prefix} 
                      suffix={suffix}
                    />
                  ) : (
                    value
                  )}
                </h3>
              </div>
              {trend && (
                <div className="flex items-center gap-1 mt-2">
                  {TrendIcon && <TrendIcon className={cn("w-3 h-3", trendColor)} />}
                  <span className={cn("text-xs font-medium", trendColor)}>
                    {trend.value > 0 ? '+' : ''}{trend.value}%
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {trend.label}
                  </span>
                </div>
              )}
            </div>
            <div className={cn(
              "p-3 rounded-lg transition-all duration-300",
              variantColors[variant]
            )}>
              <Icon className="w-6 h-6" />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
