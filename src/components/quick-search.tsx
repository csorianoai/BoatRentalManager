import { useState } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function QuickSearch() {
  const [searchTerm, setSearchTerm] = useState('')

  const handleSearch = () => {
    if (searchTerm.trim()) {
      console.log('Searching for:', searchTerm)
      // TODO: Implement actual search functionality
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto p-6">
      <div className="bg-card rounded-lg shadow-lg p-6 border border-border">
        <h2 className="text-2xl font-semibold mb-4 text-primary">Búsqueda Rápida</h2>
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="Buscar bookings, capitanes, clientes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyPress={handleKeyPress}
            className="flex-1"
            data-testid="input-quick-search"
          />
          <Button
            onClick={handleSearch}
            className="gap-2"
            data-testid="button-quick-search"
          >
            <Search className="w-4 h-4" />
            Buscar
          </Button>
        </div>
      </div>
    </div>
  )
}
