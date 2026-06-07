import apiClient from './client'

export interface NotebookMcpState {
  mcp_server_id: string
  name: string
  description?: string | null
  transport: string
  enabled: boolean
}

export const notebookMcpApi = {
  list: async (notebookId: string): Promise<NotebookMcpState[]> => {
    const response = await apiClient.get(`/notebooks/${notebookId}/mcp-servers`)
    return response.data
  },

  setState: async (
    notebookId: string,
    mcpServerId: string,
    enabled: boolean
  ): Promise<void> => {
    await apiClient.put(`/notebooks/${notebookId}/mcp-servers`, {
      mcp_server_id: mcpServerId,
      enabled,
    })
  },
}
