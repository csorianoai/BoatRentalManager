import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Wind, Thermometer, Waves, RefreshCw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface MarineSummary {
  location: string
  timestamp: string
  safetyRating: {
    score: number
    status: string
    color: string
    recommendation: string
  }
  current: {
    temperature: {
      air: string
      water?: string
    }
    windSpeed: string
    windDirection: string
    description: string
  }
}

export function WeatherBanner() {
  const { data, isLoading, error, refetch } = useQuery<MarineSummary>({
    queryKey: ['/api/marine/summary'],
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  })

  if (isLoading) {
    return (
      <div className="w-full max-w-4xl mx-auto p-4">
        <Card>
          <CardContent className="p-6 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="text-muted-foreground">Cargando condiciones marinas...</span>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="w-full max-w-4xl mx-auto p-4">
        <Card className="border-destructive">
          <CardContent className="p-6 flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            <span>Error al cargar condiciones marinas</span>
          </CardContent>
        </Card>
      </div>
    )
  }

  const getSafetyBadgeVariant = (status: string) => {
    if (status === 'EXCELLENT' || status === 'GOOD') return 'default'
    if (status === 'FAIR') return 'secondary'
    return 'destructive'
  }

  return (
    <div className="w-full max-w-4xl mx-auto p-4" data-testid="weather-banner">
      <Card className="border-primary/20">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Waves className="w-5 h-5 text-primary" />
                <div>
                  <h3 className="font-semibold text-lg">{data.location}</h3>
                  <p className="text-xs text-muted-foreground">
                    Actualizado: {new Date(data.timestamp).toLocaleTimeString('es-ES')}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2" data-testid="weather-temperature">
                <Thermometer className="w-4 h-4 text-muted-foreground" />
                <div className="text-sm">
                  <div>Aire: {data.current.temperature.air}</div>
                  {data.current.temperature.water && (
                    <div>Agua: {data.current.temperature.water}</div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2" data-testid="weather-wind">
                <Wind className="w-4 h-4 text-muted-foreground" />
                <div className="text-sm">
                  <div>{data.current.windSpeed}</div>
                  <div className="text-xs text-muted-foreground">{data.current.windDirection}</div>
                </div>
              </div>

              <Badge
                variant={getSafetyBadgeVariant(data.safetyRating.status)}
                data-testid="weather-safety-badge"
              >
                {data.safetyRating.status}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
