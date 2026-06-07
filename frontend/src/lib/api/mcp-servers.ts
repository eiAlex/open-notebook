import apiClient from './client'

export interface McpServer {
  id: string
  name: string
  description?: string | null
  enabled: boolean
  transport: 'stdio' | 'sse' | 'streamable_http'
  command?: string | null
  args?: string[] | null
  env?: Record<string, string> | null
  url?: string | null
  headers?: Record<string, string> | null
  created?: string | null
  updated?: string | null
}

export interface McpServerRequest {
  name: string
  description?: string
  enabled?: boolean
  transport: 'stdio' | 'sse' | 'streamable_http'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
}

export interface McpTestResult {
  success: boolean
  message: string
  tools?: string[] | null
}

export const mcpServersApi = {
  list: async (): Promise<McpServer[]> => {
    const response = await apiClient.get('/mcp-servers')
    return response.data
  },

  get: async (id: string): Promise<McpServer> => {
    const response = await apiClient.get(`/mcp-servers/${id}`)
    return response.data
  },

  create: async (data: McpServerRequest): Promise<McpServer> => {
    const response = await apiClient.post('/mcp-servers', data)
    return response.data
  },

  update: async (id: string, data: McpServerRequest): Promise<McpServer> => {
    const response = await apiClient.put(`/mcp-servers/${id}`, data)
    return response.data
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/mcp-servers/${id}`)
  },

  test: async (id: string): Promise<McpTestResult> => {
    const response = await apiClient.post(`/mcp-servers/${id}/test`)
    return response.data
  },
}
