import { MainLayout } from '@/components/layout/main-layout'

export default function MessagesPage() {
  return (
    <MainLayout>
      <div className="p-8">
        <h1 className="text-3xl font-bold text-primary mb-4" data-testid="heading-messages">Centro de Mensajería</h1>
        <p className="text-muted-foreground">Inbox unificado - 13 plataformas</p>
      </div>
    </MainLayout>
  )
}
