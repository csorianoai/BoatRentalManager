import { useState } from 'react'
import { useLocation } from 'wouter'
import { Anchor, LayoutDashboard, DollarSign, Waves, Calculator, Wrench, MessageSquare, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
import { MobileSidebar } from './mobile-sidebar'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/pricing', label: 'Pricing', icon: DollarSign },
  { href: '/marine', label: 'Marine', icon: Waves },
  { href: '/accounting', label: 'Contabilidad', icon: Calculator },
  { href: '/maintenance', label: 'Mantenimiento', icon: Wrench },
  { href: '/messages', label: 'Mensajes', icon: MessageSquare },
]

export function Navbar() {
  const [location, navigate] = useLocation()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  return (
    <>
      <nav className="bg-card border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => navigate('/')}
              data-testid="link-home"
            >
              <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
                <Anchor className="w-6 h-6 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold text-primary">Nadaki Excursions</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden md:flex items-center gap-2">
                {navItems.map((item) => {
                  const Icon = item.icon
                  const isActive = location === item.href
                  return (
                    <Button
                      key={item.href}
                      variant={isActive ? 'default' : 'ghost'}
                      size="sm"
                      className="gap-2"
                      onClick={() => navigate(item.href)}
                      data-testid={`link-nav-${item.href.slice(1)}`}
                    >
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </Button>
                  )
                })}
              </div>

              <ThemeToggle />

              <div className="md:hidden">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsMobileMenuOpen(true)}
                  data-testid="button-mobile-menu"
                >
                  <Menu className="w-6 h-6" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <MobileSidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
    </>
  )
}
