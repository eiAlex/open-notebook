'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Plug, ExternalLink } from 'lucide-react'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { CollapsibleColumn, createCollapseButton } from '@/components/notebooks/CollapsibleColumn'
import { useNotebookColumnsStore } from '@/lib/stores/notebook-columns-store'
import { useTranslation } from '@/lib/hooks/use-translation'
import { useNotebookMcpServers, useSetNotebookMcpState } from '@/lib/hooks/use-notebook-mcp'

interface McpColumnProps {
  notebookId: string
}

export function McpColumn({ notebookId }: McpColumnProps) {
  const { t } = useTranslation()
  const { data: servers, isLoading } = useNotebookMcpServers(notebookId)
  const setMcpState = useSetNotebookMcpState(notebookId)
  const { mcpCollapsed, toggleMcp } = useNotebookColumnsStore()

  const collapseButton = useMemo(
    () => createCollapseButton(toggleMcp, t('mcpServers.title')),
    [toggleMcp, t]
  )

  const activeCount = servers?.filter((s) => s.enabled).length ?? 0

  return (
    <CollapsibleColumn
      isCollapsed={mcpCollapsed}
      onToggle={toggleMcp}
      collapsedIcon={Plug}
      collapsedLabel={t('mcpServers.title')}
    >
      <Card className="h-full flex flex-col min-h-0">
        <CardHeader className="flex-shrink-0 pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Plug className="h-4 w-4" />
              {t('mcpServers.title')}
              {servers && servers.length > 0 && (
                <Badge variant="secondary" className="text-xs font-normal">
                  {activeCount}/{servers.length}
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-1">{collapseButton}</div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto min-h-0 pt-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner size="sm" />
            </div>
          ) : !servers || servers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
              <Plug className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">{t('mcpServers.noServers')}</p>
              <a
                href="/settings/mcp-servers"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                {t('mcpServers.configure')}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {servers.map((server) => (
                <div
                  key={server.mcp_server_id}
                  className="flex items-center justify-between p-2 rounded-md border bg-card"
                >
                  <div className="flex flex-col gap-0.5 min-w-0 mr-2">
                    <span className="text-xs font-medium truncate">{server.name}</span>
                    {server.description && (
                      <span className="text-xs text-muted-foreground line-clamp-1">
                        {server.description}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground font-mono truncate opacity-60">
                      {server.transport}
                    </span>
                  </div>
                  <Switch
                    checked={server.enabled}
                    onCheckedChange={(enabled) =>
                      setMcpState.mutate({ mcpServerId: server.mcp_server_id, enabled })
                    }
                    disabled={setMcpState.isPending}
                    aria-label={server.name}
                  />
                </div>
              ))}
              <p className="text-xs text-muted-foreground text-center pt-1">
                {t('mcpServers.autoUsed')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </CollapsibleColumn>
  )
}
