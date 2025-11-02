import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api'

// Types
export interface MarineCurrentConditions {
  temperature: {
    air: number
    water: number
  }
  wind: {
    speed: number
    direction: string
    gusts: number
  }
  waves: {
    height: number
    period: number
  }
  visibility: number
  pressure: number
  dewpoint: number
  humidity: number
  windChill: number
}

export interface MarineForecast {
  periods: Array<{
    name: string
    startTime: string
    temperature: number
    windSpeed: string
    windDirection: string
    shortForecast: string
    detailedForecast: string
  }>
}

export interface TideData {
  predictions: Array<{
    t: string // ISO timestamp
    v: string // height in feet
    type: string // 'H' or 'L'
  }>
}

export interface MarineAlert {
  id: string
  event: string
  headline: string
  severity: string
  urgency: string
  description: string
  instruction: string
  onset: string
  expires: string
}

export interface BuoyData {
  stationId: string
  latitude: number
  longitude: number
  waterTemp: number
  waveHeight: number
  dominantWavePeriod: number
  averageWavePeriod: number
  waveDirection: string
  windSpeed: number
  windDirection: string
  windGust: number
  pressure: number
  airTemp: number
  dewpoint: number
  visibility: number
  observationTime: string
}

export interface MarineSummary {
  current: MarineCurrentConditions
  forecast: MarineForecast
  tides: TideData
  alerts: {
    count: number
    alerts: MarineAlert[]
  }
  buoy: BuoyData
  safetyRating: {
    score: number
    level: 'excellent' | 'good' | 'fair' | 'poor' | 'dangerous'
    recommendation: string
    conditions: string[]
  }
  cached: boolean
  cacheTimestamp: string
}

// Hooks
export function useMarineSummary() {
  return useQuery<MarineSummary>({
    queryKey: ['/api/marine', 'summary'],
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 10 * 60 * 1000, // Refetch every 10 minutes
  })
}

export function useMarineCurrent() {
  return useQuery<MarineCurrentConditions>({
    queryKey: ['/api/marine', 'current'],
    staleTime: 5 * 60 * 1000,
  })
}

export function useMarineForecast() {
  return useQuery<MarineForecast>({
    queryKey: ['/api/marine', 'forecast'],
    staleTime: 30 * 60 * 1000, // 30 minutes
  })
}

export function useMarineTides() {
  return useQuery<TideData>({
    queryKey: ['/api/marine', 'tides'],
    staleTime: 60 * 60 * 1000, // 1 hour
  })
}

export function useMarineAlerts() {
  return useQuery<{ count: number; alerts: MarineAlert[] }>({
    queryKey: ['/api/marine', 'alerts'],
    staleTime: 5 * 60 * 1000,
  })
}

export function useMarineBuoyData() {
  return useQuery<BuoyData>({
    queryKey: ['/api/marine', 'buoy-data'],
    staleTime: 5 * 60 * 1000,
  })
}

export function useClearMarineCache() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: () => apiRequest('/api/marine/clear-cache', { method: 'POST' }),
    onSuccess: () => {
      // Invalidate all marine queries using prefix matching
      queryClient.invalidateQueries({ queryKey: ['/api/marine'] })
    },
  })
}
