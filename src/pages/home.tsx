import { Link } from 'wouter'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Hero } from '@/components/hero'
import { QuickSearch } from '@/components/quick-search'
import { WeatherBanner } from '@/components/weather-banner'

export default function HomePage() {
  const features = [
    { title: 'Dashboard', description: 'Vista general de métricas y bookings', href: '/dashboard' },
    { title: 'Pricing Dinámico', description: 'Inteligencia de mercado ML-powered', href: '/pricing' },
    { title: 'Condiciones Marinas', description: 'NOAA en tiempo real', href: '/marine' },
    { title: 'Contabilidad', description: 'Gestión financiera completa', href: '/accounting' },
    { title: 'Mantenimiento', description: 'Tracking de gastos y reparaciones', href: '/maintenance' },
    { title: 'Mensajería', description: 'Centro unificado 13 plataformas', href: '/messages' },
  ]

  return (
    <div className="min-h-screen bg-background">
      <Hero />
      
      <div className="py-8">
        <WeatherBanner />
      </div>

      <div className="pb-8">
        <QuickSearch />
      </div>

      <div className="max-w-7xl mx-auto px-4 pb-16">
        <h2 className="text-3xl font-bold text-center mb-8">Módulos del Sistema</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => (
            <Link key={feature.href} href={feature.href}>
              <Card className="cursor-pointer transition-all hover:shadow-lg hover-elevate active-elevate-2">
                <CardHeader>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full" data-testid={`button-goto-${feature.href.slice(1)}`}>
                    Ir al módulo
                  </Button>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
