import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api'

// Types
export interface Account {
  id: string
  account_code: string
  account_name: string
  account_type: 'asset' | 'liability' | 'equity' | 'income' | 'expense'
  parent_account_id?: string
  description?: string
  is_active: number
}

export interface Transaction {
  id: string
  transaction_date: string
  account_id: string
  amount: number
  transaction_type: 'debit' | 'credit' | 'income' | 'expense'
  description: string
  reference_type?: string
  reference_id?: string
  reference_number?: string
  status: 'pending' | 'posted' | 'reconciled'
  created_at: string
}

export interface BankStatement {
  id: string
  statement_date: string
  description: string
  amount: number
  transaction_type: 'debit' | 'credit'
  balance?: number
  matched_transaction_id?: string
  source_file?: string
  created_at: string
}

export interface ReconciliationSession {
  id: string
  session_name: string
  account_id: string
  start_date: string
  end_date: string
  opening_balance: number
  closing_balance: number
  status: 'in_progress' | 'completed'
  matched_count: number
  unmatched_count: number
  variance_amount: number
  completed_at?: string
  created_at: string
}

export interface CategorizationRule {
  id: string
  rule_name: string
  priority: number
  match_field: 'description' | 'amount' | 'reference'
  match_operator: 'equals' | 'contains' | 'starts_with' | 'ends_with' | 'regex' | 'greater_than' | 'less_than' | 'range'
  match_value: string
  target_account_id: string
  is_active: number
  created_at: string
}

export interface AccountingAlert {
  id: string
  alert_type: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  title: string
  description: string
  triggered_at: string
  status: 'active' | 'resolved' | 'dismissed'
  resolved_at?: string
}

// Chart of Accounts
export function useAccounts() {
  return useQuery<Account[]>({
    queryKey: ['/api/accounting/accounts'],
  })
}

export function useAccount(id: string) {
  return useQuery<Account>({
    queryKey: ['/api/accounting/accounts', id],
    enabled: !!id,
  })
}

export function useCreateAccount() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (account: Partial<Account>) =>
      apiRequest('/api/accounting/accounts', {
        method: 'POST',
        body: JSON.stringify(account),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/accounting/accounts'] })
    },
  })
}

export function useUpdateAccount() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Account> }) =>
      apiRequest(`/api/accounting/accounts/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/accounting/accounts'] })
    },
  })
}

export function useDeleteAccount() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/accounting/accounts/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/accounting/accounts'] })
    },
  })
}

// Transactions
export function useTransactions(filters?: {
  account_id?: string
  start_date?: string
  end_date?: string
  reference_type?: string
  status?: string
}) {
  const params = new URLSearchParams()
  if (filters?.account_id) params.append('account_id', filters.account_id)
  if (filters?.start_date) params.append('start_date', filters.start_date)
  if (filters?.end_date) params.append('end_date', filters.end_date)
  if (filters?.reference_type) params.append('reference_type', filters.reference_type)
  if (filters?.status) params.append('status', filters.status)
  
  return useQuery<Transaction[]>({
    queryKey: ['/api/accounting/transactions', filters],
    queryFn: () => apiRequest(`/api/accounting/transactions?${params.toString()}`),
  })
}

export function useCreateTransaction() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (transaction: Partial<Transaction>) =>
      apiRequest('/api/accounting/transactions', {
        method: 'POST',
        body: JSON.stringify(transaction),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/accounting/transactions'] })
    },
  })
}

// Bank Statements
export function useBankStatements(filters?: {
  start_date?: string
  end_date?: string
  matched?: boolean
}) {
  const params = new URLSearchParams()
  if (filters?.start_date) params.append('start_date', filters.start_date)
  if (filters?.end_date) params.append('end_date', filters.end_date)
  if (filters?.matched !== undefined) params.append('matched', filters.matched.toString())
  
  return useQuery<BankStatement[]>({
    queryKey: ['/api/accounting/bank-statements', filters],
    queryFn: () => apiRequest(`/api/accounting/bank-statements?${params.toString()}`),
  })
}

export function useUnmatchedBankStatements() {
  return useQuery<BankStatement[]>({
    queryKey: ['/api/accounting/bank-statements/unmatched'],
  })
}

export function useUploadBankStatement() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      
      return fetch('/api/accounting/bank-statements/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      }).then(res => {
        if (!res.ok) throw new Error('Upload failed')
        return res.json()
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/accounting/bank-statements'] })
    },
  })
}

// Reconciliation
export function useReconciliations() {
  return useQuery<ReconciliationSession[]>({
    queryKey: ['/api/accounting/reconciliations'],
  })
}

export function useCreateReconciliation() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (data: Partial<ReconciliationSession>) =>
      apiRequest('/api/accounting/reconciliations', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/accounting/reconciliations'] })
    },
  })
}

// Reports
export function useProfitLossReport(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['/api/accounting/profit-loss', startDate, endDate],
    queryFn: () => apiRequest(`/api/accounting/profit-loss?start_date=${startDate}&end_date=${endDate}`),
    enabled: !!startDate && !!endDate,
  })
}

export function useBalanceSheet(asOfDate?: string) {
  return useQuery({
    queryKey: ['/api/accounting/balance-sheet', asOfDate],
    queryFn: () => apiRequest(`/api/accounting/balance-sheet${asOfDate ? `?as_of_date=${asOfDate}` : ''}`),
  })
}

export function useCashFlowReport(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['/api/accounting/cash-flow', startDate, endDate],
    queryFn: () => apiRequest(`/api/accounting/cash-flow?start_date=${startDate}&end_date=${endDate}`),
    enabled: !!startDate && !!endDate,
  })
}

// Categorization Rules
export function useCategorizationRules() {
  return useQuery<CategorizationRule[]>({
    queryKey: ['/api/accounting/categorization-rules'],
  })
}

export function useCreateCategorizationRule() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (rule: Partial<CategorizationRule>) =>
      apiRequest('/api/accounting/categorization-rules', {
        method: 'POST',
        body: JSON.stringify(rule),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/accounting/categorization-rules'] })
    },
  })
}

// Alerts
export function useAccountingAlerts(status?: string) {
  const params = status ? `?status=${status}` : ''
  
  return useQuery<AccountingAlert[]>({
    queryKey: ['/api/accounting/alerts', status],
    queryFn: () => apiRequest(`/api/accounting/alerts${params}`),
  })
}

export function useResolveAlert() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/accounting/alerts/${id}/resolve`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/accounting/alerts'] })
    },
  })
}
