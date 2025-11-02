import { useState } from 'react'
import { motion } from 'framer-motion'
import { MainLayout } from '@/components/layout/main-layout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LoadingButton } from '@/components/loading-button'
import {
  DashboardSkeleton,
  TableRowSkeleton,
} from '@/components/loading-skeletons'
import {
  useCompetitorData,
  useMarketEvents,
  useDemandForecast,
  usePricingRecommendations,
  useMarketInsights,
  useGenerateRecommendation,
} from '@/hooks/use-pricing'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  Users,
  AlertCircle,
  Plus,
  Sparkles,
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import moment from 'moment'
import { useLanguage } from '@/i18n/LanguageContext'

export default function PricingPage() {
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState('overview')
  const [selectedRegion, setSelectedRegion] = useState('Miami')
  const [selectedBoatType, setSelectedBoatType] = useState('touring')

  // Data hooks
  const { data: competitors, isLoading: loadingCompetitors } = useCompetitorData(selectedRegion, selectedBoatType)
  const { data: marketEvents, isLoading: loadingEvents } = useMarketEvents(false)
  const { data: demandForecast, isLoading: loadingDemand } = useDemandForecast(selectedRegion, selectedBoatType, 14)
  const { data: recommendations, isLoading: loadingRecs } = usePricingRecommendations(selectedRegion, selectedBoatType)
  const { data: insights } = useMarketInsights(selectedRegion, selectedBoatType)

  const { mutate: generateRec, isPending: generating } = useGenerateRecommendation()

  const regions = ['Miami', 'Keys', 'Tampa', 'Fort Lauderdale']
  const boatTypes = [
    { value: 'touring', label: t('pricing.boatTypes.touring') },
    { value: 'fishing', label: t('pricing.boatTypes.fishing') },
    { value: 'VIP', label: t('pricing.boatTypes.vip') },
  ]

  const handleGenerateRecommendation = () => {
    generateRec({
      region: selectedRegion,
      boat_type: selectedBoatType,
    })
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(price)
  }

  const getDemandBadge = (score: number) => {
    if (score >= 80) return { label: t('pricing.demandLevels.high'), variant: 'default' as const }
    if (score >= 60) return { label: t('pricing.demandLevels.moderate'), variant: 'secondary' as const }
    if (score >= 40) return { label: t('pricing.demandLevels.low'), variant: 'outline' as const }
    return { label: t('pricing.demandLevels.veryLow'), variant: 'destructive' as const }
  }

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-4xl font-bold text-foreground flex items-center gap-2" data-testid="text-page-title">
                <Sparkles className="h-8 w-8 text-accent" />
                {t('pricing.title')}
              </h1>
              <p className="text-muted-foreground mt-2">
                {t('pricing.subtitle')}
              </p>
            </div>
            <div className="flex gap-3">
              <LoadingButton
                onClick={handleGenerateRecommendation}
                loading={generating}
                loadingText={t('pricing.generating')}
                data-testid="button-generate-recommendation"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {t('pricing.generateRecommendation')}
              </LoadingButton>
            </div>
          </div>

          {/* Region & Boat Type Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="flex gap-2">
              {regions.map((region) => (
                <Button
                  key={region}
                  variant={selectedRegion === region ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedRegion(region)}
                  data-testid={`button-region-${region.toLowerCase()}`}
                >
                  {region}
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              {boatTypes.map((type) => (
                <Button
                  key={type.value}
                  variant={selectedBoatType === type.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedBoatType(type.value)}
                  data-testid={`button-boat-${type.value}`}
                >
                  {type.label}
                </Button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Insights Summary Cards */}
        {insights && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tendencia de Demanda</CardTitle>
                {insights.demand_trend.trend === 'increasing' ? (
                  <TrendingUp className="h-4 w-4 text-green-600" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-600" />
                )}
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-demand-score">
                  {insights.demand_trend.current_score}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {insights.demand_trend.trend === 'increasing' ? '+' : ''}
                  {insights.demand_trend.change_percentage.toFixed(1)}% vs anterior
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Competidores</CardTitle>
                <Users className="h-4 w-4 text-secondary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-competitor-count">
                  {insights.competitor_analysis.total_competitors}
                </div>
                <p className="text-xs text-muted-foreground">
                  Promedio: {formatPrice(insights.competitor_analysis.average_half_day_price)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Posición de Precio</CardTitle>
                <DollarSign className="h-4 w-4 text-accent" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold capitalize" data-testid="text-price-position">
                  {insights.competitor_analysis.our_position}
                </div>
                <p className="text-xs text-muted-foreground">
                  {insights.competitor_analysis.price_difference_percentage > 0 ? '+' : ''}
                  {insights.competitor_analysis.price_difference_percentage.toFixed(1)}% vs mercado
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Eventos Activos</CardTitle>
                <Calendar className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-active-events">
                  {insights.active_events.length}
                </div>
                <p className="text-xs text-muted-foreground">
                  {insights.opportunities.length} oportunidades detectadas
                </p>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4" data-testid="tabs-pricing">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="demand" data-testid="tab-demand">Demand Forecast</TabsTrigger>
            <TabsTrigger value="competitors" data-testid="tab-competitors">Competitors</TabsTrigger>
            <TabsTrigger value="events" data-testid="tab-events">Market Events</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {loadingRecs ? (
              <DashboardSkeleton />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Recomendaciones Recientes</CardTitle>
                    <CardDescription>
                      {recommendations?.length || 0} recomendaciones generadas
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {recommendations?.slice(0, 5).map((rec) => (
                      <div
                        key={rec.id}
                        className="border border-border rounded-lg p-4 space-y-2 hover-elevate active-elevate-2"
                        data-testid={`recommendation-${rec.id}`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <p className="text-sm font-medium">
                              {rec.boat_type} - {rec.region}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {moment(rec.recommendation_date).format('MMM D, YYYY')}
                            </p>
                          </div>
                          <Badge variant="secondary">
                            {(rec.confidence_score * 100).toFixed(0)}% confianza
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-4 pt-2">
                          <div>
                            <p className="text-xs text-muted-foreground">Actual</p>
                            <p className="text-lg font-semibold">
                              {formatPrice(rec.current_price_half_day)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Recomendado</p>
                            <p className="text-lg font-semibold text-accent">
                              {formatPrice(rec.recommended_price_half_day)}
                            </p>
                          </div>
                        </div>
                        {rec.expected_revenue_increase > 0 && (
                          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 pt-2 border-t border-border">
                            <TrendingUp className="h-4 w-4" />
                            <span>
                              +{formatPrice(rec.expected_revenue_increase)} incremento esperado
                            </span>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground pt-2">{rec.reasoning}</p>
                      </div>
                    ))}
                    {(!recommendations || recommendations.length === 0) && (
                      <div className="text-center py-8 text-muted-foreground">
                        <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>No hay recomendaciones disponibles</p>
                        <p className="text-sm mt-1">Genera una nueva recomendación</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Oportunidades de Mercado</CardTitle>
                    <CardDescription>Insights basados en datos actuales</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {insights?.opportunities.map((opp, index) => (
                      <div
                        key={index}
                        className="border border-border rounded-lg p-4 space-y-2"
                        data-testid={`opportunity-${index}`}
                      >
                        <div className="flex items-start gap-3">
                          <Badge variant="outline" className="mt-0.5">
                            {opp.type}
                          </Badge>
                          <div className="flex-1">
                            <p className="text-sm font-medium">{opp.description}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Impacto: {opp.potential_impact}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                    {(!insights?.opportunities || insights.opportunities.length === 0) && (
                      <p className="text-center py-8 text-muted-foreground text-sm">
                        No hay oportunidades identificadas en este momento
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* Demand Forecast Tab */}
          <TabsContent value="demand" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Pronóstico de Demanda (14 días)</CardTitle>
                <CardDescription>
                  Predicción basada en ML usando datos históricos y eventos de mercado
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingDemand ? (
                  <div className="h-80 flex items-center justify-center">
                    <p className="text-muted-foreground">Cargando pronóstico...</p>
                  </div>
                ) : demandForecast && demandForecast.length > 0 ? (
                  <ResponsiveContainer width="100%" height={350}>
                    <AreaChart data={demandForecast}>
                      <defs>
                        <linearGradient id="demandGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0.1} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="forecast_date"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                        tickFormatter={(date) => moment(date).format('MMM D')}
                      />
                      <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        labelFormatter={(date) => moment(date).format('MMMM D, YYYY')}
                      />
                      <Area
                        type="monotone"
                        dataKey="predicted_demand_score"
                        stroke="hsl(var(--accent))"
                        fillOpacity={1}
                        fill="url(#demandGradient)"
                        name="Demanda Predicha"
                      />
                      <Area
                        type="monotone"
                        dataKey="confidence_level"
                        stroke="hsl(var(--secondary))"
                        fill="transparent"
                        strokeDasharray="5 5"
                        name="Nivel de Confianza"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-80 flex items-center justify-center text-muted-foreground">
                    No hay datos de pronóstico disponibles
                  </div>
                )}
              </CardContent>
            </Card>

            {demandForecast && demandForecast.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {demandForecast.slice(0, 6).map((forecast) => {
                  const badge = getDemandBadge(forecast.predicted_demand_score)
                  return (
                    <Card key={forecast.id} data-testid={`forecast-card-${forecast.id}`}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">
                            {moment(forecast.forecast_date).format('MMM D')}
                          </CardTitle>
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div>
                          <p className="text-3xl font-bold text-accent" data-testid={`demand-score-${forecast.id}`}>
                            {forecast.predicted_demand_score}%
                          </p>
                          <p className="text-xs text-muted-foreground">Score de demanda</p>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Confianza:</span>
                          <span className="font-medium">
                            {(forecast.confidence_level * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Ajuste precio:</span>
                          <span className={`font-medium ${forecast.recommended_price_modifier > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {forecast.recommended_price_modifier > 0 ? '+' : ''}
                            {(forecast.recommended_price_modifier * 100).toFixed(0)}%
                          </span>
                        </div>
                        {forecast.factors && forecast.factors.length > 0 && (
                          <div className="pt-2 border-t border-border">
                            <p className="text-xs font-medium mb-1">Factores:</p>
                            <div className="flex flex-wrap gap-1">
                              {forecast.factors.slice(0, 3).map((factor, idx) => (
                                <Badge key={idx} variant="outline" className="text-xs">
                                  {factor}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </TabsContent>

          {/* Competitors Tab */}
          <TabsContent value="competitors" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Análisis de Competencia</CardTitle>
                    <CardDescription>
                      {competitors?.length || 0} competidores rastreados
                    </CardDescription>
                  </div>
                  <Button size="sm" variant="outline" data-testid="button-add-competitor">
                    <Plus className="h-4 w-4 mr-2" />
                    Agregar Competidor
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loadingCompetitors ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <TableRowSkeleton key={i} />
                    ))}
                  </div>
                ) : competitors && competitors.length > 0 ? (
                  <div className="space-y-3">
                    {competitors.map((comp) => (
                      <div
                        key={comp.id}
                        className="border border-border rounded-lg p-4 hover-elevate active-elevate-2"
                        data-testid={`competitor-${comp.id}`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h4 className="font-semibold">{comp.competitor_name}</h4>
                            <p className="text-sm text-muted-foreground">
                              {comp.boat_type} • Capacidad: {comp.boat_capacity}
                            </p>
                          </div>
                          <Badge variant="outline">
                            {moment(comp.observation_date).format('MMM D')}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-4 mb-3">
                          <div>
                            <p className="text-xs text-muted-foreground">Medio día</p>
                            <p className="text-lg font-semibold">{formatPrice(comp.price_half_day)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Día completo</p>
                            <p className="text-lg font-semibold">{formatPrice(comp.price_full_day)}</p>
                          </div>
                        </div>
                        {comp.amenities && comp.amenities.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {comp.amenities.map((amenity, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {amenity}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {comp.notes && (
                          <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border">
                            {comp.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No hay competidores rastreados</p>
                    <p className="text-sm mt-1">Agrega competidores para análisis</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Market Events Tab */}
          <TabsContent value="events" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Eventos de Mercado</CardTitle>
                    <CardDescription>
                      Eventos que impactan precios y demanda
                    </CardDescription>
                  </div>
                  <Button size="sm" variant="outline" data-testid="button-add-event">
                    <Plus className="h-4 w-4 mr-2" />
                    Crear Evento
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loadingEvents ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4].map((i) => (
                      <TableRowSkeleton key={i} />
                    ))}
                  </div>
                ) : marketEvents && marketEvents.length > 0 ? (
                  <div className="space-y-3">
                    {marketEvents.map((event) => {
                      const isActive = moment().isBetween(event.start_date, event.end_date)
                      return (
                        <div
                          key={event.id}
                          className="border border-border rounded-lg p-4 hover-elevate active-elevate-2"
                          data-testid={`event-${event.id}`}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-semibold">{event.event_name}</h4>
                                {isActive && (
                                  <Badge variant="default" className="text-xs">
                                    Activo
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">{event.event_type}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-sm mb-3">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              <span>{moment(event.start_date).format('MMM D')} - {moment(event.end_date).format('MMM D, YYYY')}</span>
                            </div>
                            <Badge variant="outline">{event.expected_impact}</Badge>
                          </div>
                          {event.description && (
                            <p className="text-sm text-muted-foreground mb-2">{event.description}</p>
                          )}
                          {event.regions_affected && event.regions_affected.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {event.regions_affected.map((region, idx) => (
                                <Badge key={idx} variant="secondary" className="text-xs">
                                  {region}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No hay eventos registrados</p>
                    <p className="text-sm mt-1">Crea eventos para análisis de impacto</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  )
}
