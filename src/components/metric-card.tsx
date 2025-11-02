import { motion } from 'framer-motion'
import { LucideIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface MetricCardProps {
  title: string
  value: string | number
  icon: LucideIcon
  trend?: {
    value: number
    isPositive: boolean
  }
  index?: number
}

export function MetricCard({ title, value, icon: Icon, trend, index = 0 }: MetricCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
    >
      <Card className="hover-elevate active-elevate-2" data-testid={`card-metric-${title.toLowerCase().replace(/\s+/g, '-')}`}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold" data-testid={`value-metric-${title.toLowerCase().replace(/\s+/g, '-')}`}>
            {value}
          </div>
          {trend && (
            <p className="text-xs text-muted-foreground mt-1">
              <span className={trend.isPositive ? 'text-green-600' : 'text-red-600'}>
                {trend.isPositive ? '+' : ''}{trend.value}%
              </span>{' '}
              vs mes anterior
            </p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
