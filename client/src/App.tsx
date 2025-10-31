import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Boats from "@/pages/boats";
import Rentals from "@/pages/rentals";
import Customers from "@/pages/customers";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/boats" component={Boats} />
      <Route path="/rentals" component={Rentals} />
      <Route path="/customers" component={Customers} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SidebarProvider style={style as React.CSSProperties}>
          <div className="flex h-screen w-full">
            <AppSidebar />
            <div className="flex flex-col flex-1 overflow-hidden">
              <header className="flex items-center justify-between h-16 px-6 border-b">
                <SidebarTrigger data-testid="button-sidebar-toggle" />
                <h2 className="text-lg font-semibold">Boat Rental Management</h2>
              </header>
              <main className="flex-1 overflow-auto p-6">
                <div className="max-w-7xl mx-auto">
                  <Router />
                </div>
              </main>
            </div>
          </div>
        </SidebarProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
