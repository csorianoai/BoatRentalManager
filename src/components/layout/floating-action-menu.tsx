import { useState } from 'react'
import { useLocation } from 'wouter'
import { Plus, DollarSign, Waves, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'

const quickActions = [
  { href: '/pricing', label: 'Ver Pricing', icon: DollarSign },
  { href: '/marine', label: 'Ver Marine', icon: Waves },
  { href: '/messages', label: 'Mensajes', icon: MessageSquare },
]

export function FloatingActionMenu() {
  const [, navigate] = useLocation()
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="fixed bottom-6 right-6 z-30 md:hidden">
      {isOpen && (
        <div className="absolute bottom-16 right-0 flex flex-col gap-2 mb-2">
          {quickActions.map((action) => {
            const Icon = action.icon
            return (
              <Button
                key={action.href}
                variant="secondary"
                size="sm"
                className="gap-2 shadow-lg"
                onClick={() => {
                  navigate(action.href)
                  setIsOpen(false)
                }}
                data-testid={`fab-${action.href.slice(1)}`}
              >
                <Icon className="w-4 h-4" />
                {action.label}
              </Button>
            )
          })}
        </div>
      )}

      <Button
        variant="default"
        size="icon"
        className="w-14 h-14 rounded-full shadow-lg"
        onClick={() => setIsOpen(!isOpen)}
        data-testid="button-fab-toggle"
      >
        <Plus className={`w-6 h-6 transition-transform ${isOpen ? 'rotate-45' : ''}`} />
      </Button>
    </div>
  )
}
