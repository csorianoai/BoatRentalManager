import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api'

// Types
export interface BoatExpense {
  id: string
  boat_id: string
  boat_name?: string
  category: string
  amount: number
  expense_date: string
  description: string
  mechanic_id?: string
  mechanic_name?: string
  fuel_gallons?: number
  fuel_station?: string
  invoice_number?: string
  is_tax_deductible: number
  synced_to_accounting: number
  accounting_transaction_id?: string
  created_at: string
}

export interface Mechanic {
  id: string
  name: string
  company_name?: string
  phone: string
  email?: string
  specialty: string
  hourly_rate: number
  is_active: number
  created_at: string
}

export interface MaintenanceRecord {
  id: string
  boat_id: string
  boat_name?: string
  maintenance_type: string
  description: string
  performed_date: string
  mechanic_id?: string
  mechanic_name?: string
  total_cost: number
  parts_used?: string[]
  hours_worked?: number
  next_maintenance_date?: string
  status: string
  notes?: string
  created_at: string
}

export interface PartInventory {
  id: string
  part_name: string
  part_number?: string
  category: string
  quantity_in_stock: number
  reorder_level: number
  unit_cost: number
  supplier?: string
  location?: string
  notes?: string
  created_at: string
}

export interface WorkOrder {
  id: string
  boat_id: string
  boat_name?: string
  title: string
  description: string
  priority: string
  status: string
  assigned_to?: string
  created_date: string
  scheduled_date?: string
  completed_date?: string
  estimated_cost?: number
  actual_cost?: number
  notes?: string
}

// Boat Expenses
export function useBoatExpenses(filters?: {
  boat_id?: string
  category?: string
  start_date?: string
  end_date?: string
  synced?: boolean
}) {
  const params = new URLSearchParams()
  if (filters?.boat_id) params.append('boat_id', filters.boat_id)
  if (filters?.category) params.append('category', filters.category)
  if (filters?.start_date) params.append('start_date', filters.start_date)
  if (filters?.end_date) params.append('end_date', filters.end_date)
  if (filters?.synced !== undefined) params.append('synced', filters.synced.toString())
  
  return useQuery<BoatExpense[]>({
    queryKey: ['/api/boat-expenses', filters],
    queryFn: () => apiRequest(`/api/boat-expenses?${params.toString()}`),
  })
}

export function useCreateBoatExpense() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (expense: Partial<BoatExpense>) =>
      apiRequest('/api/boat-expenses', {
        method: 'POST',
        body: JSON.stringify(expense),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/boat-expenses'] })
      queryClient.invalidateQueries({ queryKey: ['/api/boat-expenses/analytics'] })
    },
  })
}

// Mechanics
export function useMechanics() {
  return useQuery<Mechanic[]>({
    queryKey: ['/api/mechanics'],
  })
}

export function useCreateMechanic() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (mechanic: Partial<Mechanic>) =>
      apiRequest('/api/mechanics', {
        method: 'POST',
        body: JSON.stringify(mechanic),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/mechanics'] })
    },
  })
}

// Maintenance Records
export function useMaintenanceRecords(filters?: {
  boat_id?: string
  maintenance_type?: string
  status?: string
}) {
  const params = new URLSearchParams()
  if (filters?.boat_id) params.append('boat_id', filters.boat_id)
  if (filters?.maintenance_type) params.append('maintenance_type', filters.maintenance_type)
  if (filters?.status) params.append('status', filters.status)
  
  return useQuery<MaintenanceRecord[]>({
    queryKey: ['/api/maintenance-records', filters],
    queryFn: () => apiRequest(`/api/maintenance-records?${params.toString()}`),
  })
}

export function useCreateMaintenanceRecord() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (record: Partial<MaintenanceRecord>) =>
      apiRequest('/api/maintenance-records', {
        method: 'POST',
        body: JSON.stringify(record),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/maintenance-records'] })
    },
  })
}

// Parts Inventory
export function usePartsInventory() {
  return useQuery<PartInventory[]>({
    queryKey: ['/api/parts-inventory'],
  })
}

export function useCreatePart() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (part: Partial<PartInventory>) =>
      apiRequest('/api/parts-inventory', {
        method: 'POST',
        body: JSON.stringify(part),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/parts-inventory'] })
    },
  })
}

// Work Orders
export function useWorkOrders(filters?: {
  boat_id?: string
  status?: string
  priority?: string
}) {
  const params = new URLSearchParams()
  if (filters?.boat_id) params.append('boat_id', filters.boat_id)
  if (filters?.status) params.append('status', filters.status)
  if (filters?.priority) params.append('priority', filters.priority)
  
  return useQuery<WorkOrder[]>({
    queryKey: ['/api/work-orders', filters],
    queryFn: () => apiRequest(`/api/work-orders?${params.toString()}`),
  })
}

export function useCreateWorkOrder() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (workOrder: Partial<WorkOrder>) =>
      apiRequest('/api/work-orders', {
        method: 'POST',
        body: JSON.stringify(workOrder),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/work-orders'] })
    },
  })
}

export function useUpdateWorkOrder() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<WorkOrder> }) =>
      apiRequest(`/api/work-orders/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/work-orders'] })
    },
  })
}

// Analytics
export function useBoatExpenseAnalytics(filters?: {
  boat_id?: string
  start_date?: string
  end_date?: string
}) {
  const params = new URLSearchParams()
  if (filters?.boat_id) params.append('boat_id', filters.boat_id)
  if (filters?.start_date) params.append('start_date', filters.start_date)
  if (filters?.end_date) params.append('end_date', filters.end_date)
  
  return useQuery({
    queryKey: ['/api/boat-expenses/analytics', filters],
    queryFn: () => apiRequest(`/api/boat-expenses/analytics?${params.toString()}`),
  })
}
