import { Link } from 'wouter'
import { Anchor } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

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
    <div className="min-h-screen bg-gradient-to-br from-primary via-secondary to-accent/20 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="bg-card rounded-lg shadow-2xl p-8 border border-border">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center">
              <Anchor className="w-10 h-10 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-primary">Nadaki Excursions</h1>
              <p className="text-muted-foreground">Portal de Gestión Integral</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <Link key={feature.href} href={feature.href}>
                <Card className="cursor-pointer transition-all hover:shadow-lg hover:scale-105">
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
    </div>
  )
}
