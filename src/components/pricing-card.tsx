import { motion } from 'framer-motion'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check, Sparkles } from 'lucide-react'

interface PricingCardProps {
  id: string
  title: string
  description: string
  price: number
  duration: string
  features: string[]
  highlighted?: boolean
  badge?: string
  onSelect?: (id: string) => void
  ctaText?: string
}

export function PricingCard({
  id,
  title,
  description,
  price,
  duration,
  features,
  highlighted = false,
  badge,
  onSelect,
  ctaText = 'Seleccionar Plan',
}: PricingCardProps) {
  const formatPrice = (value: number) => {
    return new Intl.NumberFormat('es-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(value)
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      whileHover={{ scale: highlighted ? 1.02 : 1.0, y: -4 }}
      className="group"
    >
      <Card
        className={`relative overflow-hidden transition-all duration-300 ${
          highlighted
            ? 'border-accent shadow-lg shadow-accent/20 bg-accent/5'
            : 'border-border bg-card hover-elevate active-elevate-2'
        }`}
      >
        {highlighted && (
          <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-primary/5 pointer-events-none" />
        )}

        {badge && (
          <div className="absolute -right-12 top-6 rotate-45 bg-accent px-12 py-1 text-xs font-semibold text-accent-foreground shadow-md">
            {badge}
          </div>
        )}

        <CardHeader className="space-y-3 relative">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-foreground" data-testid={`text-plan-title-${id}`}>
              {title}
            </h3>
            {highlighted && (
              <Sparkles className="h-5 w-5 text-accent" data-testid={`icon-sparkles-${id}`} />
            )}
          </div>
          <p className="text-sm text-muted-foreground" data-testid={`text-description-${id}`}>
            {description}
          </p>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="space-y-1">
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-bold text-accent" data-testid={`text-price-${id}`}>
                {formatPrice(price)}
              </span>
              <span className="text-sm text-muted-foreground">/ {duration}</span>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-border">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="flex items-start gap-3"
                data-testid={`feature-${id}-${index}`}
              >
                <div className={`mt-0.5 rounded-full p-0.5 ${
                  highlighted ? 'bg-accent/20' : 'bg-secondary/20'
                }`}>
                  <Check className={`h-3.5 w-3.5 ${
                    highlighted ? 'text-accent' : 'text-secondary'
                  }`} />
                </div>
                <span className="text-sm text-foreground flex-1">
                  {feature}
                </span>
              </motion.div>
            ))}
          </div>
        </CardContent>

        <CardFooter>
          <Button
            className="w-full"
            variant={highlighted ? 'default' : 'outline'}
            onClick={() => onSelect?.(id)}
            data-testid={`button-select-${id}`}
          >
            {ctaText}
          </Button>
        </CardFooter>
      </Card>
    </motion.div>
  )
}
