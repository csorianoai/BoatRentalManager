import { useLocation } from 'wouter'
import { Hero } from '@/components/hero'
import { QuickSearch } from '@/components/quick-search'
import { WeatherBanner } from '@/components/weather-banner'
import { FeatureCard } from '@/components/feature-card'
import { BoatCard } from '@/components/boat-card'
import { PricingCard } from '@/components/pricing-card'
import {
  LayoutDashboard,
  TrendingUp,
  Waves,
  DollarSign,
  Wrench,
  MessageSquare,
} from 'lucide-react'

export default function HomePage() {
  const [, navigate] = useLocation()

  const features = [
    {
      id: 'dashboard',
      title: 'Dashboard',
      description: 'Vista general de métricas y bookings en tiempo real con visualizaciones interactivas',
      icon: LayoutDashboard,
      href: '/dashboard',
    },
    {
      id: 'pricing',
      title: 'Pricing Dinámico',
      description: 'Inteligencia de mercado ML-powered con predicción de demanda y análisis competitivo',
      icon: TrendingUp,
      href: '/pricing',
    },
    {
      id: 'marine',
      title: 'Condiciones Marinas',
      description: 'Datos NOAA en tiempo real: clima, mareas, oleaje y alertas de seguridad',
      icon: Waves,
      href: '/marine',
    },
    {
      id: 'accounting',
      title: 'Contabilidad',
      description: 'Gestión financiera completa con reconciliación bancaria y reportes automatizados',
      icon: DollarSign,
      href: '/accounting',
    },
    {
      id: 'maintenance',
      title: 'Mantenimiento',
      description: 'Tracking de gastos, reparaciones y programa de mantenimiento preventivo',
      icon: Wrench,
      href: '/maintenance',
    },
    {
      id: 'messages',
      title: 'Mensajería',
      description: 'Centro unificado para gestionar comunicaciones de 13 plataformas de reservas',
      icon: MessageSquare,
      href: '/messages',
    },
  ]

  const sampleBoats = [
    {
      id: 'boat-sample-1',
      name: 'Sea Breeze',
      boatType: 'touring',
      capacity: 8,
      description: 'Tour panorámico por Biscayne Bay con vistas espectaculares de Miami',
      features: ['GPS', 'Sistema de audio', 'Toldo solar', 'Equipo de seguridad'],
      priceHalfDay: 350,
      priceFullDay: 600,
      status: 'active',
    },
    {
      id: 'boat-sample-2',
      name: 'Ocean Hunter',
      boatType: 'fishing',
      capacity: 6,
      description: 'Equipado para pesca deportiva con tecnología de última generación',
      features: ['Ecosonda', 'Cañas profesionales', 'Nevera', 'GPS'],
      priceHalfDay: 450,
      priceFullDay: 800,
      status: 'active',
    },
    {
      id: 'boat-sample-3',
      name: 'Luxury VIP',
      boatType: 'VIP',
      capacity: 12,
      description: 'Experiencia premium con servicio de catering y entretenimiento a bordo',
      features: ['Bar completo', 'Sistema de sonido premium', 'Jacuzzi', 'Camarotes'],
      priceHalfDay: 1200,
      priceFullDay: 2200,
      status: 'active',
    },
  ]

  const samplePricingPlans = [
    {
      id: 'plan-half-day',
      title: 'Medio Día',
      description: 'Perfecto para una escapada matutina o vespertina',
      price: 350,
      duration: '4 horas',
      features: [
        'Capitán profesional incluido',
        'Equipo de seguridad certificado',
        'Combustible incluido',
        'Seguro de embarcación',
      ],
    },
    {
      id: 'plan-full-day',
      title: 'Día Completo',
      description: 'La experiencia completa con tiempo para explorar',
      price: 600,
      duration: '8 horas',
      features: [
        'Capitán profesional incluido',
        'Equipo de seguridad certificado',
        'Combustible incluido',
        'Seguro de embarcación',
        'Refrigerios y agua',
        'Paradas en múltiples destinos',
      ],
      highlighted: true,
      badge: 'Popular',
    },
    {
      id: 'plan-vip',
      title: 'Experiencia VIP',
      description: 'Lujo y exclusividad sin compromisos',
      price: 1200,
      duration: '4 horas',
      features: [
        'Todo lo del plan completo',
        'Servicio de catering premium',
        'Bar abierto incluido',
        'Fotógrafo profesional',
        'Decoración personalizada',
        'DJ o música en vivo',
      ],
    },
  ]

  const handleFeatureClick = (href: string) => {
    navigate(href)
  }

  return (
    <div className="min-h-screen bg-background">
      <Hero />

      <div className="py-8">
        <WeatherBanner />
      </div>

      <div className="pb-8">
        <QuickSearch />
      </div>

      <div className="max-w-7xl mx-auto px-4 space-y-16 pb-16">
        <section>
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Módulos del Sistema
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Plataforma integral para gestionar tu negocio de excursiones náuticas
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <div
                key={feature.id}
                onClick={() => handleFeatureClick(feature.href)}
                className="cursor-pointer"
                data-testid={`card-feature-${feature.id}`}
              >
                <FeatureCard
                  id={feature.id}
                  title={feature.title}
                  description={feature.description}
                  icon={feature.icon}
                  index={index}
                />
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Nuestra Flota
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Embarcaciones modernas y bien mantenidas para cada ocasión
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sampleBoats.map((boat) => (
              <BoatCard
                key={boat.id}
                {...boat}
                onBook={(id) => console.log('Booking boat:', id)}
              />
            ))}
          </div>
        </section>

        <section>
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Planes y Precios
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Opciones flexibles para adaptarse a tu presupuesto y necesidades
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {samplePricingPlans.map((plan) => (
              <PricingCard
                key={plan.id}
                {...plan}
                onSelect={(id) => console.log('Selected plan:', id)}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
