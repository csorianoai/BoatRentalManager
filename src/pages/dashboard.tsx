import { useQuery } from '@tanstack/react-query'
import { MainLayout } from '@/components/layout/main-layout'
import { MetricCard } from '@/components/metric-card'
import { DollarSign, Calendar, Users, Ship, RefreshCw, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'

interface DashboardData {
  today_bookings: number
  week_bookings: number
  active_captains: number
  total_captains: number
  today_revenue: number
  week_revenue: number
  total_revenue: number
  bookings_by_platform: Record<string, number>
  revenue_by_platform: Record<string, number>
  recent_bookings: any[]
  active_captains_list: any[]
}

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ['/api/dashboard-data'],
    refetchInterval: 60 * 1000, // Refetch every minute
  })

  if (isLoading) {
    return (
      <MainLayout>
        <div className="p-4 md:p-8 flex items-center justify-center min-h-[50vh]">
          <div className="flex flex-col items-center gap-4">
            <RefreshCw className="w-8 h-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Cargando dashboard...</p>
          </div>
        </div>
      </MainLayout>
    )
  }

  if (error || !data) {
    return (
      <MainLayout>
        <div className="p-4 md:p-8">
          <Card className="border-destructive">
            <CardContent className="p-6 flex items-center gap-4">
              <AlertTriangle className="w-8 h-8 text-destructive" />
              <div>
                <h3 className="font-semibold text-destructive">Error cargando dashboard</h3>
                <p className="text-sm text-muted-foreground">No se pudieron cargar los datos del dashboard</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    )
  }

  // Transform data for charts
  const platformData = Object.entries(data.bookings_by_platform).map(([platform, bookings]) => ({
    platform,
    bookings,
  }))

  const formatCurrency = (amount: number) => `$${amount.toLocaleString('en-US', { minimumFractionDigits: 0 })}`

  return (
    <MainLayout>
      <div className="p-4 md:p-8">
        <h1 className="text-3xl font-bold text-primary mb-2" data-testid="heading-dashboard">
          Dashboard
        </h1>
        <p className="text-muted-foreground mb-8">Vista general de métricas y bookings</p>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <MetricCard
            title="Revenue Total"
            value={formatCurrency(data.total_revenue)}
            icon={DollarSign}
            index={0}
          />
          <MetricCard
            title="Bookings Semana"
            value={data.week_bookings}
            icon={Calendar}
            index={1}
          />
          <MetricCard
            title="Capitanes Activos"
            value={`${data.active_captains} / ${data.total_captains}`}
            icon={Users}
            index={2}
          />
          <MetricCard
            title="Revenue Semanal"
            value={formatCurrency(data.week_revenue)}
            icon={Ship}
            index={3}
          />
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Revenue Chart */}
          <Card data-testid="card-revenue-chart">
            <CardHeader>
              <CardTitle>Revenue por Plataforma</CardTitle>
              <CardDescription>Distribución actual</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={Object.entries(data.revenue_by_platform).map(([platform, revenue]) => ({
                  platform,
                  revenue,
                }))}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="platform" className="text-xs" angle={-45} textAnchor="end" height={100} />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                    formatter={(value) => formatCurrency(Number(value))}
                  />
                  <Bar 
                    dataKey="revenue" 
                    fill="hsl(var(--accent))" 
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Bookings by Platform Chart */}
          <Card data-testid="card-platform-chart">
            <CardHeader>
              <CardTitle>Bookings por Plataforma</CardTitle>
              <CardDescription>Distribución actual</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={platformData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="platform" className="text-xs" angle={-45} textAnchor="end" height={100} />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                  />
                  <Bar 
                    dataKey="bookings" 
                    fill="hsl(var(--secondary))" 
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  )
}
