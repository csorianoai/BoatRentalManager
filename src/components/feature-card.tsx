import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import type { LucideIcon } from 'lucide-react'

interface FeatureCardProps {
  id: string
  title: string
  description: string
  icon: LucideIcon
  index?: number
}

export function FeatureCard({
  id,
  title,
  description,
  icon: Icon,
  index = 0,
}: FeatureCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        delay: index * 0.1,
        ease: [0.25, 0.1, 0.25, 1],
      }}
      whileHover={{ y: -6 }}
      className="group"
    >
      <Card className="h-full border-border bg-card hover-elevate active-elevate-2 transition-all duration-300">
        <CardHeader className="space-y-4">
          <motion.div
            whileHover={{ rotate: [0, -10, 10, -10, 0], scale: 1.1 }}
            transition={{ duration: 0.5 }}
            className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/20"
            data-testid={`icon-wrapper-${id}`}
          >
            <Icon className="h-6 w-6" data-testid={`icon-${id}`} />
          </motion.div>
          <h3 className="text-xl font-semibold text-foreground" data-testid={`text-title-${id}`}>
            {title}
          </h3>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground leading-relaxed" data-testid={`text-description-${id}`}>
            {description}
          </p>
        </CardContent>
      </Card>
    </motion.div>
  )
}
