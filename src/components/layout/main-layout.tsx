import { Navbar } from './navbar'
import { FloatingActionMenu } from './floating-action-menu'

interface MainLayoutProps {
  children: React.ReactNode
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>{children}</main>
      <FloatingActionMenu />
    </div>
  )
}
