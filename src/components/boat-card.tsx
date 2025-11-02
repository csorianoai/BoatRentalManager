import { motion } from 'framer-motion'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LoadingButton } from '@/components/loading-button'
import { Anchor, Users, Clock } from 'lucide-react'

interface BoatCardProps {
  id: string
  name: string
  boatType: string
  capacity: number
  description?: string
  features?: string[]
  priceHalfDay?: number
  priceFullDay?: number
  status?: string
  imageUrl?: string
  onBook?: (id: string) => void
  isBooking?: boolean
}

export function BoatCard({
  id,
  name,
  boatType,
  capacity,
  description,
  features = [],
  priceHalfDay,
  priceFullDay,
  status = 'active',
  imageUrl,
  onBook,
  isBooking = false,
}: BoatCardProps) {
  const getBoatTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      fishing: 'Pesca Deportiva',
      touring: 'Tour Turístico',
      VIP: 'Experiencia VIP',
      standard: 'Estándar',
    }
    return labels[type] || type
  }

  const getBoatTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      fishing: 'bg-secondary/10 text-secondary border-secondary/20',
      touring: 'bg-accent/10 text-accent border-accent/20',
      VIP: 'bg-accent text-accent-foreground border-accent',
      standard: 'bg-muted text-muted-foreground border-border',
    }
    return colors[type] || colors.standard
  }

  const formatPrice = (price?: number) => {
    if (!price) return null
    return new Intl.NumberFormat('es-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(price)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      whileHover={{ y: -8 }}
      className="group"
    >
      <Card className="overflow-hidden border-border bg-card hover-elevate active-elevate-2 transition-all duration-300">
        {imageUrl && (
          <div className="relative aspect-video overflow-hidden bg-muted">
            <img
              src={imageUrl}
              alt={name}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/20 to-transparent" />
            <Badge
              className={`absolute right-3 top-3 ${getBoatTypeColor(boatType)}`}
              data-testid={`badge-boat-type-${id}`}
            >
              {getBoatTypeLabel(boatType)}
            </Badge>
          </div>
        )}

        <CardHeader className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <Anchor className="h-5 w-5 text-primary" data-testid={`icon-anchor-${id}`} />
              <h3 className="text-xl font-semibold text-foreground" data-testid={`text-boat-name-${id}`}>
                {name}
              </h3>
            </div>
            {status === 'active' && (
              <div className="h-2 w-2 rounded-full bg-green-500" data-testid={`status-active-${id}`} />
            )}
          </div>
          {description && (
            <p className="text-sm text-muted-foreground line-clamp-2" data-testid={`text-description-${id}`}>
              {description}
            </p>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1" data-testid={`capacity-${id}`}>
              <Users className="h-4 w-4" />
              <span>{capacity} personas</span>
            </div>
          </div>

          {features.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {features.slice(0, 3).map((feature, index) => (
                <Badge
                  key={index}
                  variant="secondary"
                  className="text-xs"
                  data-testid={`badge-feature-${id}-${index}`}
                >
                  {feature}
                </Badge>
              ))}
              {features.length > 3 && (
                <Badge variant="secondary" className="text-xs" data-testid={`badge-more-${id}`}>
                  +{features.length - 3}
                </Badge>
              )}
            </div>
          )}

          {(priceHalfDay || priceFullDay) && (
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
              {priceHalfDay && (
                <div className="space-y-1" data-testid={`price-half-day-${id}`}>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>Medio día</span>
                  </div>
                  <p className="text-lg font-semibold text-accent">
                    {formatPrice(priceHalfDay)}
                  </p>
                </div>
              )}
              {priceFullDay && (
                <div className="space-y-1" data-testid={`price-full-day-${id}`}>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>Día completo</span>
                  </div>
                  <p className="text-lg font-semibold text-accent">
                    {formatPrice(priceFullDay)}
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>

        <CardFooter>
          <LoadingButton
            className="w-full"
            variant="default"
            onClick={() => onBook?.(id)}
            disabled={status !== 'active'}
            loading={isBooking}
            loadingText="Reservando..."
            data-testid={`button-book-${id}`}
          >
            {status === 'active' ? 'Reservar Ahora' : 'No Disponible'}
          </LoadingButton>
        </CardFooter>
      </Card>
    </motion.div>
  )
}
