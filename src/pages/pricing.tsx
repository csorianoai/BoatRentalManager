import { MainLayout } from '@/components/layout/main-layout'

export default function PricingPage() {
  return (
    <MainLayout>
      <div className="p-8">
        <h1 className="text-3xl font-bold text-primary mb-4" data-testid="heading-pricing">Pricing Dinámico</h1>
        <p className="text-muted-foreground">Inteligencia de mercado ML-powered</p>
      </div>
    </MainLayout>
  )
}
