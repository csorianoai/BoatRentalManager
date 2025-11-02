import { useLocation } from 'wouter'
import { X, LayoutDashboard, DollarSign, Waves, Calculator, Wrench, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/pricing', label: 'Pricing Dinámico', icon: DollarSign },
  { href: '/marine', label: 'Condiciones Marinas', icon: Waves },
  { href: '/accounting', label: 'Contabilidad', icon: Calculator },
  { href: '/maintenance', label: 'Mantenimiento', icon: Wrench },
  { href: '/messages', label: 'Mensajes', icon: MessageSquare },
]

interface MobileSidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function MobileSidebar({ isOpen, onClose }: MobileSidebarProps) {
  const [location, navigate] = useLocation()

  if (!isOpen) return null

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40 md:hidden"
        onClick={onClose}
        data-testid="overlay-mobile-sidebar"
      />
      
      <div className="fixed inset-y-0 left-0 w-64 bg-card border-r border-border z-50 md:hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-primary">Nadaki Excursions</h2>
          <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-sidebar">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <nav className="p-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = location === item.href
            return (
              <Button
                key={item.href}
                variant={isActive ? 'default' : 'ghost'}
                className="w-full justify-start gap-2"
                onClick={() => {
                  navigate(item.href)
                  onClose()
                }}
                data-testid={`link-mobile-${item.href.slice(1)}`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Button>
            )
          })}
        </nav>
      </div>
    </>
  )
}
