import { Route, Switch } from 'wouter'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from './components/theme-provider'
import { fetcher } from './lib/api'

import HomePage from './pages/home'
import DashboardPage from './pages/dashboard'
import PricingPage from './pages/pricing'
import MarinePage from './pages/marine'
import AccountingPage from './pages/accounting'
import MaintenancePage from './pages/maintenance'
import MessagesPage from './pages/messages'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: ({ queryKey }) => fetcher(queryKey[0] as string),
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000,
    },
  },
})

export default function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="nadaki-ui-theme">
      <QueryClientProvider client={queryClient}>
        <Switch>
          <Route path="/" component={HomePage} />
          <Route path="/dashboard" component={DashboardPage} />
          <Route path="/pricing" component={PricingPage} />
          <Route path="/marine" component={MarinePage} />
          <Route path="/accounting" component={AccountingPage} />
          <Route path="/maintenance" component={MaintenancePage} />
          <Route path="/messages" component={MessagesPage} />
        </Switch>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
