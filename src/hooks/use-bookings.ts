import { useQuery } from '@tanstack/react-query'

// Types
export interface DashboardData {
  today_bookings: number
  week_bookings: number
  active_captains: number
  total_captains: number
  today_revenue: number
  week_revenue: number
  total_revenue: number
  bookings_by_platform: Record<string, number>
  revenue_by_platform: Record<string, number>
  recent_bookings: RecentBooking[]
}

export interface RecentBooking {
  id: string
  platform: string
  customer_name: string
  customer_phone: string
  customer_email: string
  boat_type: string
  booking_date: string
  start_time: string
  duration_hours: number
  total_amount: number
  status: string
  assigned_captain_id?: string
  captain_name?: string
}

// Dashboard Data Hook
export function useDashboardData() {
  return useQuery<DashboardData>({
    queryKey: ['/api/dashboard-data'],
    refetchInterval: 30000, // Refetch every 30 seconds
  })
}
