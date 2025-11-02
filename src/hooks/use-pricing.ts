import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api'

// Types
export interface Boat {
  id: string
  name: string
  capacity: number
  boat_type: string
  status: string
}

export interface CompetitorData {
  id: string
  region: string
  boat_type: string
  competitor_name: string
  price_half_day: number
  price_full_day: number
  boat_capacity: number
  amenities: string[]
  source_url: string
  observation_date: string
  notes?: string
}

export interface MarketEvent {
  id: string
  event_name: string
  event_type: string
  start_date: string
  end_date: string
  expected_impact: string
  description?: string
  regions_affected: string[]
}

export interface DemandForecast {
  id: string
  forecast_date: string
  region: string
  boat_type: string
  predicted_demand_score: number
  confidence_level: number
  recommended_price_modifier: number
  factors: string[]
  forecast_timestamp: string
}

export interface PricingRecommendation {
  id: string
  recommendation_date: string
  region: string
  boat_type: string
  current_price_half_day: number
  current_price_full_day: number
  recommended_price_half_day: number
  recommended_price_full_day: number
  confidence_score: number
  reasoning: string
  expected_revenue_increase: number
  market_conditions: any
}

export interface MarketInsights {
  region: string
  boat_type: string
  date_range: {
    start: string
    end: string
  }
  demand_trend: {
    current_score: number
    trend: 'increasing' | 'stable' | 'decreasing'
    change_percentage: number
  }
  competitor_analysis: {
    total_competitors: number
    average_half_day_price: number
    average_full_day_price: number
    our_position: 'below' | 'at' | 'above'
    price_difference_percentage: number
  }
  active_events: MarketEvent[]
  opportunities: Array<{
    type: string
    description: string
    potential_impact: string
  }>
}

// Boats
export function useBoats() {
  return useQuery<Boat[]>({
    queryKey: ['/api/pricing/boats'],
  })
}

export function useCreateBoat() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (boat: Partial<Boat>) =>
      apiRequest('/api/pricing/boats', {
        method: 'POST',
        body: JSON.stringify(boat),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pricing/boats'] })
    },
  })
}

// Competitor Data
export function useCompetitorData(region?: string, boatType?: string) {
  const params = new URLSearchParams()
  if (region) params.append('region', region)
  if (boatType) params.append('boat_type', boatType)
  
  return useQuery<CompetitorData[]>({
    queryKey: ['/api/pricing/competitor-data', region, boatType],
    queryFn: () => apiRequest(`/api/pricing/competitor-data?${params.toString()}`),
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateCompetitorData() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (data: Partial<CompetitorData>) =>
      apiRequest('/api/pricing/competitor-data', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pricing/competitor-data'] })
    },
  })
}

// Market Events
export function useMarketEvents(activeOnly = false) {
  return useQuery<MarketEvent[]>({
    queryKey: ['/api/pricing/market-events', activeOnly],
    queryFn: () => apiRequest(`/api/pricing/market-events?activeOnly=${activeOnly}`),
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateMarketEvent() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (event: Partial<MarketEvent>) =>
      apiRequest('/api/pricing/market-events', {
        method: 'POST',
        body: JSON.stringify(event),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pricing/market-events'] })
    },
  })
}

// Demand Forecast
export function useDemandForecast(region?: string, boatType?: string, days = 7) {
  const params = new URLSearchParams({ days: days.toString() })
  if (region) params.append('region', region)
  if (boatType) params.append('boat_type', boatType)
  
  return useQuery<DemandForecast[]>({
    queryKey: ['/api/pricing/demand-forecast', region, boatType, days],
    queryFn: () => apiRequest(`/api/pricing/demand-forecast?${params.toString()}`),
    staleTime: 24 * 60 * 60 * 1000, // 24 hours (forecasts are cached for a day)
  })
}

// Pricing Recommendations
export function usePricingRecommendations(region?: string, boatType?: string) {
  const params = new URLSearchParams()
  if (region) params.append('region', region)
  if (boatType) params.append('boat_type', boatType)
  
  return useQuery<PricingRecommendation[]>({
    queryKey: ['/api/pricing/recommendations', region, boatType],
    queryFn: () => apiRequest(`/api/pricing/recommendations?${params.toString()}`),
    staleTime: 5 * 60 * 1000,
  })
}

export function useGenerateRecommendation() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (params: { region: string; boat_type: string }) =>
      apiRequest('/api/pricing/recommend', {
        method: 'POST',
        body: JSON.stringify(params),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pricing/recommendations'] })
    },
  })
}

// Market Insights
export function useMarketInsights(region: string, boatType: string) {
  return useQuery<MarketInsights>({
    queryKey: ['/api/pricing/market-insights', region, boatType],
    queryFn: () => apiRequest(`/api/pricing/market-insights?region=${region}&boat_type=${boatType}`),
    staleTime: 5 * 60 * 1000,
    enabled: !!region && !!boatType,
  })
}
