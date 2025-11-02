import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { useState } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { 
  DollarSign, 
  Calendar, 
  Users, 
  Star,
  RefreshCw, 
  AlertTriangle, 
  TrendingUp,
  BarChart3,
  MessageSquare,
  Settings,
  Waves,
  FileDown,
  FileSpreadsheet,
  LogOut,
  ChevronDown
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend
} from 'recharts'
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

interface SyncStatus {
  platform: string
  sync_status: 'success' | 'error' | 'in_progress' | 'never'
  last_sync_at: string | null
  bookings_synced: number
  conflicts_detected: number
}

const PLATFORMS = [
  'Airbnb',
  'GetMyBoat',
  'BoatSetter',
  'Viator',
  'Expedia',
  'TripAdvisor',
  'Groupon',
  'Booking.com',
  'FareHarbor',
  'Bokun',
  'Rezdy',
  'Peek',
  'Xola'
]

const CHART_COLORS = [
  '#1E90FF',
  '#D4AF37',
  '#0A2E52',
  '#4169E1',
  '#FFD700',
  '#1C4E80',
  '#00BFFF',
  '#DAA520',
  '#1A3A52',
  '#87CEEB',
  '#B8860B',
  '#6495ED',
  '#F0E68C'
]

export default function DashboardPage() {
  const [dateRange, setDateRange] = useState('thisWeek')
  const [selectedPlatform, setSelectedPlatform] = useState('all')
  const { t } = useLanguage()
  const [, navigate] = useLocation()
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ['/api/dashboard-data'],
    refetchInterval: 60 * 1000,
  })

  const { data: syncStatus, refetch: refetchSyncStatus } = useQuery<SyncStatus[]>({
    queryKey: ['/api/sync/status'],
    refetchInterval: 30 * 1000,
  })

  const syncAllMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/sync/trigger-all', { method: 'POST' })
      if (!response.ok) throw new Error('Sync failed')
      return response.json()
    },
    onSuccess: () => {
      refetchSyncStatus()
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard-data'] })
    },
  })

  const syncPlatformMutation = useMutation({
    mutationFn: async (platform: string) => {
      const response = await fetch(`/api/sync/trigger/${platform}`, { method: 'POST' })
      if (!response.ok) throw new Error('Sync failed')
      return response.json()
    },
    onSuccess: () => {
      refetchSyncStatus()
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard-data'] })
    },
  })

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

  const formatCurrency = (amount: number) => `$${amount.toLocaleString('en-US', { minimumFractionDigits: 0 })}`

  const revenueData = Object.entries(data.revenue_by_platform).map(([platform, revenue]) => ({
    platform,
    revenue,
  }))

  const platformBookingsData = Object.entries(data.bookings_by_platform).map(([platform, bookings], index) => ({
    name: platform,
    value: bookings,
    color: CHART_COLORS[index % CHART_COLORS.length],
  }))

  const monthlyTrendsData = [
    { month: 'Jun 2025', bookings: 35, revenue: 4500 },
    { month: 'Jul 2025', bookings: 45, revenue: 5200 },
    { month: 'Ago 2025', bookings: 28, revenue: 3800 },
    { month: 'Sept 2025', bookings: 55, revenue: 6200 },
    { month: 'Oct 2025', bookings: 52, revenue: 5800 },
    { month: 'Nov 2025', bookings: 38, revenue: 4500 },
  ]

  const rankingData = Object.entries(data.revenue_by_platform)
    .map(([platform, revenue]) => ({
      platform,
      revenue,
      bookings: data.bookings_by_platform[platform] || 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)

  const getSyncStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-500 hover:bg-green-600" data-testid={`badge-status-success`}>{t('dashboard.success')}</Badge>
      case 'error':
        return <Badge variant="destructive" data-testid={`badge-status-error`}>{t('dashboard.error')}</Badge>
      case 'in_progress':
        return <Badge className="bg-blue-500 hover:bg-blue-600" data-testid={`badge-status-progress`}>{t('dashboard.inProgress')}</Badge>
      default:
        return <Badge variant="secondary" data-testid={`badge-status-never`}>{t('dashboard.never')}</Badge>
    }
  }

  return (
    <MainLayout>
      <div className="min-h-screen bg-background">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="bg-gradient-to-r from-[#0A2E52] via-[#1E90FF] to-[#0A2E52] text-white py-6 px-4 md:px-8"
        >
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
              <h1 className="text-2xl md:text-3xl font-bold" data-testid="heading-dashboard-title">
                {t('dashboard.title')}
              </h1>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <select
                    value={dateRange}
                    onChange={(e) => setDateRange(e.target.value)}
                    className="appearance-none bg-white/10 backdrop-blur-sm border border-white/20 rounded-md px-4 py-2 pr-10 text-white cursor-pointer hover-elevate"
                    data-testid="select-date-range"
                  >
                    <option value="thisWeek">{t('dashboard.thisWeek')}</option>
                    <option value="thisMonth">{t('dashboard.thisMonth')}</option>
                    <option value="lastMonth">{t('dashboard.lastMonth')}</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" />
                </div>
                
                <div className="relative">
                  <select
                    value={selectedPlatform}
                    onChange={(e) => setSelectedPlatform(e.target.value)}
                    className="appearance-none bg-white/10 backdrop-blur-sm border border-white/20 rounded-md px-4 py-2 pr-10 text-white cursor-pointer hover-elevate"
                    data-testid="select-platform"
                  >
                    <option value="all">{t('dashboard.allPlatforms')}</option>
                    {PLATFORMS.map((platform) => (
                      <option key={platform} value={platform}>
                        {platform}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" />
                </div>

                <Button
                  variant="secondary"
                  onClick={() => syncAllMutation.mutate()}
                  disabled={syncAllMutation.isPending}
                  className="gap-2"
                  data-testid="button-sync-all"
                >
                  <RefreshCw className={`w-4 h-4 ${syncAllMutation.isPending ? 'animate-spin' : ''}`} />
                  {t('dashboard.syncAll')}
                </Button>

                <Button
                  variant="outline"
                  className="gap-2 bg-white/10 backdrop-blur-sm border-white/20 text-white hover:bg-white/20"
                  data-testid="button-logout"
                >
                  <LogOut className="w-4 h-4" />
                  {t('dashboard.logout')}
                </Button>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="max-w-7xl mx-auto px-4 md:px-8 py-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-9 gap-3 mb-8"
          >
            {[
              { icon: Calendar, label: t('dashboard.calendar'), path: '/schedule', testId: 'nav-calendar' },
              { icon: DollarSign, label: t('dashboard.commissions'), path: '/commissions', testId: 'nav-commissions' },
              { icon: TrendingUp, label: t('dashboard.prices'), path: '/pricing', testId: 'nav-pricing' },
              { icon: BarChart3, label: t('dashboard.accounting'), path: '/accounting', testId: 'nav-accounting' },
              { icon: MessageSquare, label: t('dashboard.messages'), path: '/messages', testId: 'nav-messages' },
              { icon: Settings, label: t('dashboard.maintenance'), path: '/maintenance', testId: 'nav-maintenance' },
              { icon: Waves, label: t('dashboard.marineConditions'), path: '/marine', testId: 'nav-marine' },
              { icon: FileDown, label: t('dashboard.exportPDF'), path: '#', testId: 'nav-pdf' },
              { icon: FileSpreadsheet, label: t('dashboard.exportExcel'), path: '#', testId: 'nav-excel' },
            ].map((item, index) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: 0.1 + index * 0.05 }}
              >
                <Card
                  className="hover-elevate active-elevate-2 cursor-pointer transition-all"
                  onClick={() => item.path !== '#' && navigate(item.path)}
                  data-testid={item.testId}
                >
                  <CardContent className="p-4 flex flex-col items-center justify-center gap-2 text-center">
                    <div className="p-3 bg-primary/10 text-primary rounded-lg">
                      <item.icon className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground line-clamp-2">
                      {item.label}
                    </span>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
          >
            <Card className="overflow-hidden hover-elevate transition-all" data-testid="card-today-bookings">
              <div className="bg-gradient-to-br from-[#1E90FF] to-[#0A2E52] text-white p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="p-3 bg-white/20 backdrop-blur-sm rounded-lg">
                    <Calendar className="w-6 h-6" />
                  </div>
                  <Badge className="bg-green-500/20 text-green-100 border-green-300/30">+15%</Badge>
                </div>
                <p className="text-sm text-white/80 mb-2">{t('dashboard.todayBookings')}</p>
                <p className="text-4xl font-bold" data-testid="value-today-bookings">{data.today_bookings}</p>
              </div>
            </Card>

            <Card className="overflow-hidden hover-elevate transition-all" data-testid="card-today-revenue">
              <div className="bg-gradient-to-br from-[#1E90FF] to-[#0A2E52] text-white p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="p-3 bg-white/20 backdrop-blur-sm rounded-lg">
                    <DollarSign className="w-6 h-6" />
                  </div>
                  <Badge className="bg-green-500/20 text-green-100 border-green-300/30">+23%</Badge>
                </div>
                <p className="text-sm text-white/80 mb-2">{t('dashboard.todayRevenue')}</p>
                <p className="text-4xl font-bold" data-testid="value-today-revenue">{formatCurrency(data.today_revenue)}</p>
              </div>
            </Card>

            <Card className="overflow-hidden hover-elevate transition-all" data-testid="card-active-captains">
              <div className="bg-gradient-to-br from-[#1E90FF] to-[#0A2E52] text-white p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="p-3 bg-white/20 backdrop-blur-sm rounded-lg">
                    <Users className="w-6 h-6" />
                  </div>
                </div>
                <p className="text-sm text-white/80 mb-2">{t('dashboard.activeCaptains')}</p>
                <p className="text-4xl font-bold" data-testid="value-active-captains">
                  {data.active_captains} <span className="text-xl text-white/60">{t('dashboard.of')} {data.total_captains} {t('dashboard.total')}</span>
                </p>
              </div>
            </Card>

            <Card className="overflow-hidden hover-elevate transition-all" data-testid="card-satisfaction">
              <div className="bg-gradient-to-br from-[#1E90FF] to-[#0A2E52] text-white p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="p-3 bg-white/20 backdrop-blur-sm rounded-lg">
                    <Star className="w-6 h-6 fill-current" />
                  </div>
                </div>
                <p className="text-sm text-white/80 mb-2">{t('dashboard.satisfaction')}</p>
                <p className="text-4xl font-bold" data-testid="value-satisfaction">
                  4.8<span className="text-xl text-white/60">/5</span>
                </p>
                <p className="text-sm text-white/60 mt-1">{t('dashboard.average')}</p>
              </div>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8"
          >
            <Card className="hover-elevate transition-all" data-testid="card-revenue-platform">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-[#D4AF37]" />
                  {t('dashboard.revenueByPlatform')}
                </CardTitle>
                <CardDescription>
                  <div className="flex items-center justify-between">
                    <span>{t('dashboard.currentDistribution')}</span>
                    <Badge variant="secondary" data-testid="badge-total-revenue">{formatCurrency(data.total_revenue)}</Badge>
                  </div>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={revenueData}>
                    <defs>
                      <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1E90FF" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#0A2E52" stopOpacity={0.7} />
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
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      }}
                      formatter={(value) => formatCurrency(Number(value))}
                    />
                    <Bar dataKey="revenue" fill="url(#revenueGradient)" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="hover-elevate transition-all" data-testid="card-booking-distribution">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-secondary" />
                  {t('dashboard.bookingDistribution')}
                </CardTitle>
                <CardDescription>{t('dashboard.bookingsDistribution')}</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={platformBookingsData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {platformBookingsData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="hover-elevate transition-all" data-testid="card-monthly-trends">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  {t('dashboard.monthlyTrends')}
                </CardTitle>
                <CardDescription>
                  {t('dashboard.bookings')} & {t('dashboard.revenue')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={monthlyTrendsData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" opacity={0.2} />
                    <XAxis dataKey="month" className="text-xs" />
                    <YAxis yAxisId="left" className="text-xs" />
                    <YAxis yAxisId="right" orientation="right" className="text-xs" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Legend />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="bookings"
                      stroke="#1E90FF"
                      strokeWidth={3}
                      name={t('dashboard.bookings')}
                      dot={{ fill: '#1E90FF', r: 5 }}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="revenue"
                      stroke="#D4AF37"
                      strokeWidth={3}
                      name={t('dashboard.revenue')}
                      dot={{ fill: '#D4AF37', r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="hover-elevate transition-all" data-testid="card-ranking">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-[#D4AF37]" />
                  {t('dashboard.ranking')}
                </CardTitle>
                <CardDescription>Top 5 {t('dashboard.revenueByPlatform')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {rankingData.map((item, index) => (
                    <motion.div
                      key={item.platform}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.1 }}
                      className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 hover-elevate transition-all"
                      data-testid={`ranking-item-${index + 1}`}
                    >
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-[#1E90FF] to-[#0A2E52] text-white font-bold text-lg">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold">{item.platform}</p>
                        <p className="text-sm text-muted-foreground">
                          {item.bookings} {t('dashboard.bookings')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg text-[#D4AF37]">{formatCurrency(item.revenue)}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <RefreshCw className="w-6 h-6 text-primary" />
                {t('dashboard.syncStatus')}
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {PLATFORMS.map((platform) => {
                const status = syncStatus?.find((s) => s.platform === platform) || {
                  platform,
                  sync_status: 'never' as const,
                  last_sync_at: null,
                  bookings_synced: 0,
                  conflicts_detected: 0,
                }

                return (
                  <motion.div
                    key={platform}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Card className="hover-elevate transition-all" data-testid={`sync-card-${platform.toLowerCase().replace(/\./g, '-')}`}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">{platform}</CardTitle>
                          {getSyncStatusBadge(status.sync_status)}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{t('dashboard.lastSync')}:</span>
                          <span className="font-medium" data-testid={`sync-last-${platform.toLowerCase().replace(/\./g, '-')}`}>
                            {status.last_sync_at
                              ? new Date(status.last_sync_at).toLocaleString()
                              : t('dashboard.never')}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{t('dashboard.syncedBookings')}:</span>
                          <span className="font-medium" data-testid={`sync-bookings-${platform.toLowerCase().replace(/\./g, '-')}`}>
                            {status.bookings_synced}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{t('dashboard.conflicts')}:</span>
                          <span className="font-medium" data-testid={`sync-conflicts-${platform.toLowerCase().replace(/\./g, '-')}`}>
                            {status.conflicts_detected}
                          </span>
                        </div>
                        <Button
                          className="w-full gap-2"
                          variant="secondary"
                          size="sm"
                          onClick={() => syncPlatformMutation.mutate(platform)}
                          disabled={syncPlatformMutation.isPending}
                          data-testid={`button-sync-${platform.toLowerCase().replace(/\./g, '-')}`}
                        >
                          <RefreshCw className={`w-4 h-4 ${syncPlatformMutation.isPending ? 'animate-spin' : ''}`} />
                          {t('dashboard.sync')}
                        </Button>
                      </CardContent>
                    </Card>
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
        </div>
      </div>
    </MainLayout>
  )
}
