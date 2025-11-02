import { motion } from 'framer-motion'
import { Anchor, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLocation } from 'wouter'

export function Hero() {
  const [, navigate] = useLocation()

  return (
    <div className="relative min-h-[500px] flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary via-secondary to-accent opacity-90 dark:opacity-95" />
      
      <motion.div
        className="absolute inset-0 bg-gradient-to-tr from-accent/20 via-transparent to-primary/20"
        animate={{
          backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: 'linear',
        }}
        style={{ backgroundSize: '400% 400%' }}
      />

      <div className="relative z-10 max-w-4xl mx-auto px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-lg">
              <Anchor className="w-10 h-10 text-primary" />
            </div>
          </div>
          
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-4">
            Nadaki Excursions
          </h1>
          <p className="text-xl md:text-2xl text-white/90 mb-8">
            Portal de Gestión Integral de Excursiones Marinas
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <Button
            size="lg"
            variant="secondary"
            className="gap-2 shadow-lg"
            onClick={() => navigate('/dashboard')}
            data-testid="button-hero-dashboard"
          >
            Ir al Dashboard
            <ArrowRight className="w-4 h-4" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="gap-2 bg-white/10 backdrop-blur-sm border-white/30 text-white hover:bg-white/20"
            onClick={() => navigate('/marine')}
            data-testid="button-hero-marine"
          >
            Condiciones Marinas
          </Button>
        </motion.div>
      </div>
    </div>
  )
}
