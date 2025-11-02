import { MainLayout } from '@/components/layout/main-layout'

export default function DashboardPage() {
  return (
    <MainLayout>
      <div className="p-8">
        <h1 className="text-3xl font-bold text-primary mb-4" data-testid="heading-dashboard">Dashboard</h1>
        <p className="text-muted-foreground">Vista general de métricas y bookings</p>
      </div>
    </MainLayout>
  )
}
