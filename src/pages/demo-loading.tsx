import { useState } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import {
  BoatCardSkeleton,
  PricingCardSkeleton,
  FeatureCardSkeleton,
  MetricCardSkeleton,
  DashboardSkeleton,
  FormSkeleton,
  TableRowSkeleton,
} from '@/components/loading-skeletons'
import { BoatCard } from '@/components/boat-card'
import { PricingCard } from '@/components/pricing-card'
import { LoadingButton } from '@/components/loading-button'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function DemoLoadingPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [isBooking, setIsBooking] = useState(false)
  const [isSelecting, setIsSelecting] = useState(false)

  const handleButtonClick = () => {
    setIsLoading(true)
    setTimeout(() => setIsLoading(false), 2000)
  }

  const handleBooking = () => {
    setIsBooking(true)
    setTimeout(() => setIsBooking(false), 2000)
  }

  const handleSelectPlan = () => {
    setIsSelecting(true)
    setTimeout(() => setIsSelecting(false), 2000)
  }

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-12">
        <div>
          <h1 className="text-4xl font-bold text-foreground mb-2" data-testid="text-page-title">
            Loading States Demo
          </h1>
          <p className="text-muted-foreground">
            Demostración de microinteracciones y estados de carga
          </p>
        </div>

        <section>
          <h2 className="text-2xl font-bold mb-6">LoadingButton Component</h2>
          <div className="flex flex-wrap gap-4">
            <LoadingButton
              onClick={handleButtonClick}
              loading={isLoading}
              loadingText="Procesando..."
              data-testid="button-demo-loading"
            >
              Click para Loading
            </LoadingButton>
            <LoadingButton
              variant="secondary"
              onClick={handleButtonClick}
              loading={isLoading}
              data-testid="button-demo-secondary"
            >
              Secondary Variant
            </LoadingButton>
            <LoadingButton
              variant="outline"
              onClick={handleButtonClick}
              loading={isLoading}
              data-testid="button-demo-outline"
            >
              Outline Variant
            </LoadingButton>
            <LoadingButton
              variant="destructive"
              onClick={handleButtonClick}
              loading={isLoading}
              loadingText="Eliminando..."
              data-testid="button-demo-destructive"
            >
              Destructive
            </LoadingButton>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-6">Skeleton Components</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <h3 className="text-lg font-semibold mb-3">MetricCard Skeleton</h3>
              <MetricCardSkeleton />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-3">FeatureCard Skeleton</h3>
              <FeatureCardSkeleton />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-3">Basic Skeleton</h3>
              <Card>
                <CardHeader>
                  <Skeleton className="h-6 w-40" />
                </CardHeader>
                <CardContent className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-5/6" />
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-6">BoatCard with Loading</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <BoatCardSkeleton />
            <BoatCard
              id="demo-boat"
              name="Ocean Explorer"
              boatType="touring"
              capacity={8}
              description="Tour panorámico con vistas espectaculares"
              features={['GPS', 'Audio', 'Toldo']}
              priceHalfDay={350}
              priceFullDay={600}
              status="active"
              onBook={handleBooking}
              isBooking={isBooking}
            />
            <BoatCardSkeleton />
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-6">PricingCard with Loading</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <PricingCardSkeleton />
            <PricingCard
              id="demo-plan"
              title="Plan Demo"
              description="Plan de demostración con loading state"
              price={600}
              duration="8 horas"
              features={[
                'Feature 1',
                'Feature 2',
                'Feature 3',
                'Feature 4',
              ]}
              highlighted
              badge="Popular"
              onSelect={handleSelectPlan}
              isSelecting={isSelecting}
            />
            <PricingCardSkeleton />
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-6">Form Skeleton</h2>
          <div className="max-w-md">
            <FormSkeleton />
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-6">Table Rows Skeleton</h2>
          <Card>
            <CardHeader>
              <CardTitle>Tabla de Datos</CardTitle>
            </CardHeader>
            <CardContent>
              {[1, 2, 3, 4, 5].map((i) => (
                <TableRowSkeleton key={i} />
              ))}
            </CardContent>
          </Card>
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-6">Dashboard Skeleton</h2>
          <DashboardSkeleton />
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-6">Button Microinteractions</h2>
          <p className="text-muted-foreground mb-4">
            Los botones tienen hover-elevate y active-elevate-2 automáticos
          </p>
          <div className="flex flex-wrap gap-4">
            <Button data-testid="button-micro-default">Default</Button>
            <Button variant="secondary" data-testid="button-micro-secondary">Secondary</Button>
            <Button variant="outline" data-testid="button-micro-outline">Outline</Button>
            <Button variant="ghost" data-testid="button-micro-ghost">Ghost</Button>
            <Button variant="destructive" data-testid="button-micro-destructive">Destructive</Button>
          </div>
        </section>
      </div>
    </MainLayout>
  )
}
