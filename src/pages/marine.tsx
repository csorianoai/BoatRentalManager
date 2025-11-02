import { motion } from 'framer-motion'
import { MainLayout } from '@/components/layout/main-layout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LoadingButton } from '@/components/loading-button'
import { DashboardSkeleton } from '@/components/loading-skeletons'
import {
  useMarineSummary,
  useClearMarineCache,
} from '@/hooks/use-marine'
import {
  Waves,
  Wind,
  Thermometer,
  Eye,
  Gauge,
  Droplets,
  AlertTriangle,
  RefreshCw,
  CloudRain,
  TrendingUp,
  TrendingDown,
  Anchor,
} from 'lucide-react'
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import moment from 'moment'

export default function MarinePage() {
  const { data: summary, isLoading, refetch } = useMarineSummary()
  const { mutate: clearCache, isPending: clearing } = useClearMarineCache()

  const handleRefresh = () => {
    clearCache(undefined, {
      onSuccess: () => {
        refetch()
      }
    })
  }

  const getSafetyColor = (level: string) => {
    switch (level) {
      case 'excellent':
        return 'bg-green-600 dark:bg-green-500'
      case 'good':
        return 'bg-blue-600 dark:bg-blue-500'
      case 'fair':
        return 'bg-yellow-600 dark:bg-yellow-500'
      case 'poor':
        return 'bg-orange-600 dark:bg-orange-500'
      case 'dangerous':
        return 'bg-red-600 dark:bg-red-500'
      default:
        return 'bg-gray-600'
    }
  }

  const getSafetyBadgeVariant = (level: string) => {
    switch (level) {
      case 'excellent':
      case 'good':
        return 'default' as const
      case 'fair':
        return 'secondary' as const
      case 'poor':
      case 'dangerous':
        return 'destructive' as const
      default:
        return 'outline' as const
    }
  }

  const windDirection = (degrees: string) => {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    const index = Math.round(parseFloat(degrees) / 45) % 8
    return dirs[index] || degrees
  }

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between flex-wrap gap-4"
        >
          <div>
            <h1 className="text-4xl font-bold text-foreground flex items-center gap-2" data-testid="text-page-title">
              <Waves className="h-8 w-8 text-secondary" />
              Condiciones Marinas en Vivo
            </h1>
            <p className="text-muted-foreground mt-2">
              Datos en tiempo real de NOAA - Biscayne Bay, Miami
            </p>
            {summary?.cached && (
              <p className="text-xs text-muted-foreground mt-1">
                Última actualización: {moment(summary.cacheTimestamp).fromNow()}
              </p>
            )}
          </div>
          <LoadingButton
            onClick={handleRefresh}
            loading={clearing || isLoading}
            loadingText="Actualizando..."
            variant="outline"
            size="sm"
            data-testid="button-refresh"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refrescar Datos
          </LoadingButton>
        </motion.div>

        {isLoading ? (
          <DashboardSkeleton />
        ) : summary ? (
          <>
            {/* Alerts */}
            {summary.alerts.count > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-3"
              >
                {summary.alerts.alerts.map((alert) => (
                  <Card
                    key={alert.id}
                    className="border-destructive bg-destructive/10"
                    data-testid={`alert-${alert.id}`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <CardTitle className="text-base">{alert.event}</CardTitle>
                            <Badge variant="destructive">{alert.severity}</Badge>
                          </div>
                          <p className="text-sm font-medium">{alert.headline}</p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-2">{alert.description}</p>
                      {alert.instruction && (
                        <p className="text-sm font-medium">{alert.instruction}</p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mt-3">
                        <span>Inicio: {moment(alert.onset).format('MMM D, h:mm A')}</span>
                        <span>Expira: {moment(alert.expires).format('MMM D, h:mm A')}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </motion.div>
            )}

            {/* Safety Score */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="overflow-hidden">
                <div className={`h-2 ${getSafetyColor(summary.safetyRating.level)}`} />
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-2xl">Safety Score</CardTitle>
                      <CardDescription className="mt-2">
                        {summary.safetyRating.recommendation}
                      </CardDescription>
                    </div>
                    <div className="text-right">
                      <div
                        className="text-6xl font-bold"
                        data-testid="text-safety-score"
                        style={{ color: `hsl(${(summary.safetyRating.score / 100) * 120}, 70%, 50%)` }}
                      >
                        {summary.safetyRating.score}
                      </div>
                      <Badge
                        variant={getSafetyBadgeVariant(summary.safetyRating.level)}
                        className="mt-2"
                      >
                        {summary.safetyRating.level.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                {summary.safetyRating.conditions.length > 0 && (
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {summary.safetyRating.conditions.map((condition, index) => (
                        <Badge key={index} variant="outline">
                          {condition}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            </motion.div>

            {/* Current Conditions Grid */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
            >
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Temperatura</CardTitle>
                  <Thermometer className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-air-temp">
                    {summary.current.temperature.air}°F
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Agua: {summary.current.temperature.water}°F
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Viento</CardTitle>
                  <Wind className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-wind-speed">
                    {summary.current.wind.speed} mph
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {windDirection(summary.current.wind.direction)} • Ráfagas: {summary.current.wind.gusts} mph
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Olas</CardTitle>
                  <Waves className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-wave-height">
                    {summary.current.waves.height} ft
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Período: {summary.current.waves.period}s
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Visibilidad</CardTitle>
                  <Eye className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-visibility">
                    {summary.current.visibility} mi
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Presión: {summary.current.pressure} mb
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            {/* Weather Forecast & Tides */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Weather Forecast */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CloudRain className="h-5 w-5" />
                    Pronóstico del Tiempo
                  </CardTitle>
                  <CardDescription>Próximos días - NOAA Weather</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {summary.forecast.periods.slice(0, 6).map((period, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 border border-border rounded-lg hover-elevate"
                        data-testid={`forecast-period-${index}`}
                      >
                        <div className="flex-1">
                          <p className="font-medium text-sm">{period.name}</p>
                          <p className="text-xs text-muted-foreground">{period.shortForecast}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Viento: {period.windSpeed} {period.windDirection}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold">{period.temperature}°F</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Tides */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Mareas
                  </CardTitle>
                  <CardDescription>Próximas 24 horas</CardDescription>
                </CardHeader>
                <CardContent>
                  {summary.tides.predictions.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <AreaChart
                        data={summary.tides.predictions.slice(0, 24).map(p => ({
                          time: moment(p.t).format('HH:mm'),
                          height: parseFloat(p.v),
                          type: p.type,
                        }))}
                      >
                        <defs>
                          <linearGradient id="tideGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--secondary))" stopOpacity={0.8} />
                            <stop offset="95%" stopColor="hsl(var(--secondary))" stopOpacity={0.1} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis
                          dataKey="time"
                          tick={{ fill: 'hsl(var(--muted-foreground))' }}
                        />
                        <YAxis
                          tick={{ fill: 'hsl(var(--muted-foreground))' }}
                          label={{ value: 'Altura (ft)', angle: -90, position: 'insideLeft' }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="height"
                          stroke="hsl(var(--secondary))"
                          fillOpacity={1}
                          fill="url(#tideGradient)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-64 flex items-center justify-center text-muted-foreground">
                      No hay datos de mareas disponibles
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    {summary.tides.predictions.slice(0, 4).map((tide, index) => (
                      <div
                        key={index}
                        className="text-center p-2 border border-border rounded-md"
                        data-testid={`tide-${index}`}
                      >
                        <div className="flex items-center justify-center gap-1 mb-1">
                          {tide.type === 'H' ? (
                            <TrendingUp className="h-3 w-3 text-secondary" />
                          ) : (
                            <TrendingDown className="h-3 w-3 text-destructive" />
                          )}
                          <span className="text-xs font-medium">
                            {tide.type === 'H' ? 'Alta' : 'Baja'}
                          </span>
                        </div>
                        <p className="text-lg font-bold">{parseFloat(tide.v).toFixed(1)} ft</p>
                        <p className="text-xs text-muted-foreground">
                          {moment(tide.t).format('h:mm A')}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Buoy Data */}
            {summary.buoy && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Anchor className="h-5 w-5" />
                        Datos de Boya NDBC 41009
                      </CardTitle>
                      <CardDescription>
                        Biscayne Bay - {summary.buoy.latitude.toFixed(2)}°N, {summary.buoy.longitude.toFixed(2)}°W
                      </CardDescription>
                    </div>
                    <Badge variant="outline">
                      {moment(summary.buoy.observationTime).fromNow()}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Temp Agua</p>
                      <p className="text-xl font-bold">{summary.buoy.waterTemp}°F</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Altura Olas</p>
                      <p className="text-xl font-bold">{summary.buoy.waveHeight} ft</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Período Olas</p>
                      <p className="text-xl font-bold">{summary.buoy.dominantWavePeriod}s</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Viento</p>
                      <p className="text-xl font-bold">{summary.buoy.windSpeed} mph</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Presión</p>
                      <p className="text-xl font-bold">{summary.buoy.pressure} mb</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Visibilidad</p>
                      <p className="text-xl font-bold">{summary.buoy.visibility} mi</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <Waves className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <p>No se pudieron cargar los datos marinos</p>
            <Button onClick={handleRefresh} variant="outline" className="mt-4">
              Intentar de nuevo
            </Button>
          </div>
        )}
      </div>
    </MainLayout>
  )
}
