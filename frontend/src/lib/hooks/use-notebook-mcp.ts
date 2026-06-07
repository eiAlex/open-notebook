import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notebookMcpApi } from '@/lib/api/notebook-mcp'

export const NOTEBOOK_MCP_KEYS = {
  list: (notebookId: string) => ['notebook-mcp', notebookId] as const,
}

export function useNotebookMcpServers(notebookId: string) {
  return useQuery({
    queryKey: NOTEBOOK_MCP_KEYS.list(notebookId),
    queryFn: () => notebookMcpApi.list(notebookId),
    enabled: !!notebookId,
  })
}

export function useSetNotebookMcpState(notebookId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ mcpServerId, enabled }: { mcpServerId: string; enabled: boolean }) =>
      notebookMcpApi.setState(notebookId, mcpServerId, enabled),
    onMutate: async ({ mcpServerId, enabled }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: NOTEBOOK_MCP_KEYS.list(notebookId) })
      const previous = queryClient.getQueryData(NOTEBOOK_MCP_KEYS.list(notebookId))
      queryClient.setQueryData(NOTEBOOK_MCP_KEYS.list(notebookId), (old: any[]) =>
        old?.map((s) => (s.mcp_server_id === mcpServerId ? { ...s, enabled } : s))
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(NOTEBOOK_MCP_KEYS.list(notebookId), context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: NOTEBOOK_MCP_KEYS.list(notebookId) })
    },
  })
}
