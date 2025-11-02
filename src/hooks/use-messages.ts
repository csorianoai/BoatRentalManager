import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api'

// Types
export interface PlatformConfig {
  id: string
  platform_name: string
  ingestion_method: string
  webhook_url?: string
  is_active: number
  last_sync_at?: string
  sync_frequency_minutes?: number
  total_messages_synced: number
}

export interface MessageThread {
  id: string
  platform_name: string
  customer_name: string
  customer_email?: string
  customer_phone?: string
  subject?: string
  first_message_at: string
  last_message_at: string
  message_count: number
  status: string
  assigned_to?: string
  priority: string
}

export interface PlatformMessage {
  id: string
  thread_id: string
  platform_name: string
  direction: string
  sender_name?: string
  sender_email?: string
  sender_phone?: string
  recipient_name?: string
  recipient_email?: string
  recipient_phone?: string
  message_text: string
  sent_at: string
  read_status: number
  metadata?: any
}

export interface MessageTemplate {
  id: string
  template_name: string
  template_category: string
  subject?: string
  message_body: string
  variables?: string[]
  language: string
  is_active: number
  created_at: string
}

export interface MessagingAnalytics {
  total_messages: number
  total_threads: number
  messages_by_platform: Record<string, number>
  messages_by_direction: {
    inbound: number
    outbound: number
  }
  unread_count: number
  response_time_avg_minutes: number
  messages_by_status: Record<string, number>
  recent_activity: Array<{
    date: string
    message_count: number
  }>
}

// Platform Configs
export function usePlatformConfigs() {
  return useQuery<PlatformConfig[]>({
    queryKey: ['/api/messages/platforms'],
  })
}

// Message Threads (Inbox)
export function useMessageThreads(filters?: {
  platform?: string
  status?: string
  priority?: string
  limit?: number
}) {
  const params = new URLSearchParams()
  if (filters?.platform) params.append('platform', filters.platform)
  if (filters?.status) params.append('status', filters.status)
  if (filters?.priority) params.append('priority', filters.priority)
  if (filters?.limit) params.append('limit', filters.limit.toString())
  
  return useQuery<MessageThread[]>({
    queryKey: ['/api/messages/inbox', filters],
    queryFn: () => apiRequest(`/api/messages/inbox?${params.toString()}`),
    refetchInterval: 30000, // Refetch every 30 seconds for real-time updates
  })
}

// Thread Messages
export function useThreadMessages(threadId: string) {
  return useQuery<PlatformMessage[]>({
    queryKey: ['/api/messages/threads', threadId],
    enabled: !!threadId,
    refetchInterval: 10000, // Refetch every 10 seconds for conversation updates
  })
}

// Manual Message Ingestion
export function useIngestManualMessage() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (message: Partial<PlatformMessage> & { platform_name: string; customer_name: string }) =>
      apiRequest('/api/messages/manual', {
        method: 'POST',
        body: JSON.stringify(message),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/messages/inbox'] })
      queryClient.invalidateQueries({ queryKey: ['/api/messages/unread-count'] })
    },
  })
}

// Send Message
export function useSendMessage() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (params: {
      thread_id: string
      message_text: string
      send_via: string
      recipient_phone?: string
      recipient_email?: string
    }) =>
      apiRequest('/api/messages/send', {
        method: 'POST',
        body: JSON.stringify(params),
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/messages/threads', variables.thread_id] })
      queryClient.invalidateQueries({ queryKey: ['/api/messages/inbox'] })
    },
  })
}

// Update Message Status
export function useUpdateMessageStatus() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ messageId, status }: { messageId: string; status: string }) =>
      apiRequest(`/api/messages/${messageId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/messages/threads'] })
      queryClient.invalidateQueries({ queryKey: ['/api/messages/inbox'] })
      queryClient.invalidateQueries({ queryKey: ['/api/messages/unread-count'] })
    },
  })
}

// Unread Count
export function useUnreadCount() {
  return useQuery<{ unread_count: number }>({
    queryKey: ['/api/messages/unread-count'],
    refetchInterval: 30000, // Refetch every 30 seconds
  })
}

// Message Templates
export function useMessageTemplates(category?: string) {
  const params = category ? `?category=${category}` : ''
  
  return useQuery<MessageTemplate[]>({
    queryKey: ['/api/messages/templates', category],
    queryFn: () => apiRequest(`/api/messages/templates${params}`),
  })
}

export function useCreateMessageTemplate() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (template: Partial<MessageTemplate>) =>
      apiRequest('/api/messages/templates', {
        method: 'POST',
        body: JSON.stringify(template),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/messages/templates'] })
    },
  })
}

// Analytics
export function useMessagingAnalytics(filters?: {
  start_date?: string
  end_date?: string
  platform?: string
}) {
  const params = new URLSearchParams()
  if (filters?.start_date) params.append('start_date', filters.start_date)
  if (filters?.end_date) params.append('end_date', filters.end_date)
  if (filters?.platform) params.append('platform', filters.platform)
  
  return useQuery<MessagingAnalytics>({
    queryKey: ['/api/messages/analytics', filters],
    queryFn: () => apiRequest(`/api/messages/analytics?${params.toString()}`),
  })
}
