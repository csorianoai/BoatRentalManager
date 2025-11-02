import { MainLayout } from '@/components/layout/main-layout'

export default function MarinePage() {
  return (
    <MainLayout>
      <div className="p-8">
        <h1 className="text-3xl font-bold text-primary mb-4" data-testid="heading-marine">Condiciones Marinas</h1>
        <p className="text-muted-foreground">NOAA en tiempo real - Weather, Tides, Alerts</p>
      </div>
    </MainLayout>
  )
}
