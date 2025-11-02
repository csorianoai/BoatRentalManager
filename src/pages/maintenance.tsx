import { MainLayout } from '@/components/layout/main-layout'

export default function MaintenancePage() {
  return (
    <MainLayout>
      <div className="p-8">
        <h1 className="text-3xl font-bold text-primary mb-4" data-testid="heading-maintenance">Mantenimiento de Barcos</h1>
        <p className="text-muted-foreground">Tracking de gastos y reparaciones</p>
      </div>
    </MainLayout>
  )
}
