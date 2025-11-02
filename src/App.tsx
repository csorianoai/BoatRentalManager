import { Route, Switch } from 'wouter'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Anchor, Rocket } from 'lucide-react'
import { ThemeProvider } from './components/theme-provider'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000,
    },
  },
})

function Dashboard() {
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-6 cursor-pointer transition-colors hover:bg-primary/10">
              <h3 className="text-lg font-semibold text-primary mb-2">Dashboard</h3>
              <p className="text-sm text-muted-foreground">Vista general de métricas</p>
            </div>
            <div className="bg-secondary/5 border border-secondary/20 rounded-lg p-6 cursor-pointer transition-colors hover:bg-secondary/10">
              <h3 className="text-lg font-semibold text-secondary mb-2">Pricing Dinámico</h3>
              <p className="text-sm text-muted-foreground">Inteligencia de mercado</p>
            </div>
            <div className="bg-accent/5 border border-accent/20 rounded-lg p-6 cursor-pointer transition-colors hover:bg-accent/10">
              <h3 className="text-lg font-semibold text-accent mb-2">Condiciones Marinas</h3>
              <p className="text-sm text-muted-foreground">NOAA en tiempo real</p>
            </div>
          </div>

          <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4 flex items-center gap-2">
            <Rocket className="w-5 h-5 text-destructive" />
            <p className="text-destructive font-medium">
              Sistema React en construcción - Rediseño completo en progreso
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="nadaki-ui-theme">
      <QueryClientProvider client={queryClient}>
        <Switch>
          <Route path="/" component={Dashboard} />
        </Switch>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
