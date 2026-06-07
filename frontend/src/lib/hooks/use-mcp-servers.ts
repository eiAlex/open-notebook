import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'

import { type McpServerRequest, type McpTestResult, mcpServersApi } from '@/lib/api/mcp-servers'
import { useTranslation } from '@/lib/hooks/use-translation'

export const MCP_QUERY_KEYS = {
  all: ['mcp-servers'] as const,
  detail: (id: string) => ['mcp-servers', id] as const,
}

export function useMcpServers() {
  return useQuery({
    queryKey: MCP_QUERY_KEYS.all,
    queryFn: () => mcpServersApi.list(),
  })
}

export function useMcpServer(id: string) {
  return useQuery({
    queryKey: MCP_QUERY_KEYS.detail(id),
    queryFn: () => mcpServersApi.get(id),
    enabled: !!id,
  })
}

export function useCreateMcpServer() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (data: McpServerRequest) => mcpServersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MCP_QUERY_KEYS.all })
      toast.success(t('mcpServers.createSuccess'))
    },
    onError: () => {
      toast.error(t('mcpServers.createError'))
    },
  })
}

export function useUpdateMcpServer() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: McpServerRequest }) =>
      mcpServersApi.update(id, data),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: MCP_QUERY_KEYS.all })
      queryClient.invalidateQueries({ queryKey: MCP_QUERY_KEYS.detail(id) })
      toast.success(t('mcpServers.updateSuccess'))
    },
    onError: () => {
      toast.error(t('mcpServers.updateError'))
    },
  })
}

export function useDeleteMcpServer() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (id: string) => mcpServersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MCP_QUERY_KEYS.all })
      toast.success(t('mcpServers.deleteSuccess'))
    },
    onError: () => {
      toast.error(t('mcpServers.deleteError'))
    },
  })
}

export function useTestMcpServer() {
  const [testResults, setTestResults] = useState<Record<string, McpTestResult>>({})

  const mutation = useMutation({
    mutationFn: (id: string) => mcpServersApi.test(id),
    onSuccess: (data, id) => {
      setTestResults(prev => ({ ...prev, [id]: data }))
    },
    onError: (_error, id) => {
      setTestResults(prev => ({
        ...prev,
        [id]: { success: false, message: 'Request failed' },
      }))
    },
  })

  return {
    testServer: (id: string) => mutation.mutate(id),
    isPending: mutation.isPending,
    pendingId: mutation.isPending ? mutation.variables : null,
    testResults,
    clearResult: (id: string) =>
      setTestResults(prev => {
        const next = { ...prev }
        delete next[id]
        return next
      }),
  }
}
