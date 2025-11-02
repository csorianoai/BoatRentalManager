import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { MainLayout } from '@/components/layout/main-layout'
import { EnhancedMetricCard } from '@/components/enhanced-metric-card'
import { DollarSign, Calendar, Users, Ship, RefreshCw, AlertTriangle, Plus, TrendingUp, Waves, DollarSignIcon } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useLanguage } from '@/i18n/LanguageContext'
import { useLocation } from 'wouter'

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
  const { t } = useLanguage()
  const [, navigate] = useLocation()

  if (isLoading) {
    return (
      <MainLayout>
        <div className="p-4 md:p-8 flex items-center justify-center min-h-[50vh]">
          <div className="flex flex-col items-center gap-4">
            <RefreshCw className="w-8 h-8 animate-spin text-primary" />
            <p className="text-muted-foreground">{t('dashboard.loading')}</p>
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
                <h3 className="font-semibold text-destructive">{t('dashboard.errorLoading')}</h3>
                <p className="text-sm text-muted-foreground">{t('dashboard.errorMessage')}</p>
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
      {/* Hero Section with Gradient */}
      <motion.div 
        className="relative bg-gradient-to-br from-[#0A2E52] via-[#1E90FF] to-[#0A2E52] text-white overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
      >
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItaDJWMzZoLTJ6bTAtNGgydjJoLTJ2LTJ6bTAtNHYyaC0ydi0yaDF6bS0yLTJ2LTJoMnYyaC0yem0tMiAwdjJoLTJ2LTJoMnptLTItMmgtMnYtMmgydjJ6bTItMnYtMmgydjJoLTJ6bTIgMGgydjJoLTJ2LTJ6bTIgMnYyaC0ydi0yaDJ6bTAgMmgydjJoLTJ2LTJ6bS0yIDBoLTJ2Mmgydi0yem0wLTJoMnYtMmgydjJoLTJ2Mmgtdi0yem0wLTJ2LTJoMnYyaC0yem0tMi0yaDJ2Mmgtdi0yem0tMiAyaDJ2MmgtMnYtMnptMC0yaC0ydjJoMnYtMnoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-20"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-3" data-testid="heading-dashboard">
              {t('dashboard.title')}
            </h1>
            <p className="text-xl text-blue-100 max-w-2xl">
              {t('dashboard.subtitle')}
            </p>
          </motion.div>
        </div>
      </motion.div>

      <div className="p-4 md:p-8">
        {/* Enhanced Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <EnhancedMetricCard
            title={t('dashboard.totalRevenue')}
            value={data.total_revenue}
            prefix="$"
            icon={DollarSign}
            index={0}
            trend={{ value: 12, label: t('dashboard.vsLastWeek') }}
            variant="success"
          />
          <EnhancedMetricCard
            title={t('dashboard.weekBookings')}
            value={data.week_bookings}
            icon={Calendar}
            index={1}
            trend={{ value: 8, label: t('dashboard.vsLastWeek') }}
            variant="default"
          />
          <EnhancedMetricCard
            title={t('dashboard.activeCaptains')}
            value={`${data.active_captains}/${data.total_captains}`}
            icon={Users}
            index={2}
            variant="default"
          />
          <EnhancedMetricCard
            title={t('dashboard.weekRevenue')}
            value={data.week_revenue}
            prefix="$"
            icon={Ship}
            index={3}
            trend={{ value: 15, label: t('dashboard.vsLastWeek') }}
            variant="success"
          />
        </div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mb-8"
        >
          <h2 className="text-2xl font-bold mb-4">{t('dashboard.quickActions')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="hover-elevate active-elevate-2 cursor-pointer transition-all">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-primary/10 text-primary rounded-lg">
                    <Plus className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-1">{t('dashboard.newBooking')}</h3>
                    <p className="text-sm text-muted-foreground">Crear nueva reserva</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card 
              className="hover-elevate active-elevate-2 cursor-pointer transition-all"
              onClick={() => navigate('/pricing')}
              data-testid="quick-action-pricing"
            >
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-accent/10 text-accent rounded-lg">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-1">{t('dashboard.viewPricing')}</h3>
                    <p className="text-sm text-muted-foreground">Inteligencia ML de mercado</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card 
              className="hover-elevate active-elevate-2 cursor-pointer transition-all"
              onClick={() => navigate('/marine')}
              data-testid="quick-action-marine"
            >
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-secondary/10 text-secondary rounded-lg">
                    <Waves className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-1">{t('dashboard.marineConditions')}</h3>
                    <p className="text-sm text-muted-foreground">Datos NOAA en vivo</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.div>

        {/* Charts Grid - Enhanced with Gradients */}
        <motion.div
          className="grid grid-cols-1 lg:grid-cols-2 gap-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
        >
          {/* Revenue Chart */}
          <Card data-testid="card-revenue-chart" className="hover-elevate transition-all">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSignIcon className="w-5 h-5 text-[#D4AF37]" />
                {t('dashboard.revenueByPlatform')}
              </CardTitle>
              <CardDescription>Distribución actual de ingresos</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={Object.entries(data.revenue_by_platform).map(([platform, revenue]) => ({
                  platform,
                  revenue,
                }))}>
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#D4AF37" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#D4AF37" stopOpacity={0.3} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" opacity={0.2} />
                  <XAxis dataKey="platform" className="text-xs" angle={-45} textAnchor="end" height={100} />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    }}
                    formatter={(value) => formatCurrency(Number(value))}
                  />
                  <Bar 
                    dataKey="revenue" 
                    fill="url(#revenueGradient)" 
                    radius={[8, 8, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Bookings by Platform Chart */}
          <Card data-testid="card-platform-chart" className="hover-elevate transition-all">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-secondary" />
                {t('dashboard.bookingsByPlatform')}
              </CardTitle>
              <CardDescription>Distribución actual de reservas</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={platformData}>
                  <defs>
                    <linearGradient id="bookingsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1E90FF" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#1E90FF" stopOpacity={0.3} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" opacity={0.2} />
                  <XAxis dataKey="platform" className="text-xs" angle={-45} textAnchor="end" height={100} />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    }}
                  />
                  <Bar 
                    dataKey="bookings" 
                    fill="url(#bookingsGradient)" 
                    radius={[8, 8, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </MainLayout>
  )
}
