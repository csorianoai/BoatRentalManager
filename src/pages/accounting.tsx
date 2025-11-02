import { MainLayout } from '@/components/layout/main-layout'

export default function AccountingPage() {
  return (
    <MainLayout>
      <div className="p-8">
        <h1 className="text-3xl font-bold text-primary mb-4" data-testid="heading-accounting">Contabilidad</h1>
        <p className="text-muted-foreground">Gestión financiera completa</p>
      </div>
    </MainLayout>
  )
}
