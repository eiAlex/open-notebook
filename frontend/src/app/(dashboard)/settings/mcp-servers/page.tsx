'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Edit, Loader2, Plug, Plus, Trash2, XCircle, FlaskConical } from 'lucide-react'
import { useTranslation } from '@/lib/hooks/use-translation'
import {
  useMcpServers,
  useCreateMcpServer,
  useUpdateMcpServer,
  useDeleteMcpServer,
  useTestMcpServer,
} from '@/lib/hooks/use-mcp-servers'
import type { McpServer, McpServerRequest } from '@/lib/api/mcp-servers'

type TransportType = 'stdio' | 'sse' | 'streamable_http'

interface FormValues {
  name: string
  description: string
  enabled: boolean
  transport: TransportType
  command: string
  args: string
  env: string
  url: string
  headers: string
}

const defaultValues: FormValues = {
  name: '',
  description: '',
  enabled: true,
  transport: 'stdio',
  command: '',
  args: '',
  env: '',
  url: '',
  headers: '',
}

function parseKvLines(text: string): Record<string, string> | undefined {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (!lines.length) return undefined
  const obj: Record<string, string> = {}
  for (const line of lines) {
    const eq = line.indexOf('=')
    if (eq > 0) {
      obj[line.slice(0, eq)] = line.slice(eq + 1)
    }
  }
  return Object.keys(obj).length > 0 ? obj : undefined
}

function kvToText(obj?: Record<string, string> | null): string {
  if (!obj) return ''
  return Object.entries(obj)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
}

function serverToForm(server: McpServer): FormValues {
  return {
    name: server.name,
    description: server.description ?? '',
    enabled: server.enabled,
    transport: server.transport,
    command: server.command ?? '',
    args: (server.args ?? []).join(' '),
    env: kvToText(server.env),
    url: server.url ?? '',
    headers: kvToText(server.headers),
  }
}

function formToRequest(values: FormValues): McpServerRequest {
  const isStdio = values.transport === 'stdio'
  return {
    name: values.name.trim(),
    description: values.description.trim() || undefined,
    enabled: values.enabled,
    transport: values.transport,
    command: isStdio ? values.command.trim() || undefined : undefined,
    args: isStdio && values.args.trim() ? values.args.trim().split(/\s+/) : undefined,
    env: isStdio ? parseKvLines(values.env) : undefined,
    url: !isStdio ? values.url.trim() || undefined : undefined,
    headers: !isStdio ? parseKvLines(values.headers) : undefined,
  }
}

export default function McpServersPage() {
  const { t } = useTranslation()
  const { data: servers = [], isLoading } = useMcpServers()
  const createServer = useCreateMcpServer()
  const updateServer = useUpdateMcpServer()
  const deleteServer = useDeleteMcpServer()
  const { testServer, isPending: isTesting, pendingId, testResults } = useTestMcpServer()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingServer, setEditingServer] = useState<McpServer | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<McpServer | null>(null)

  const { register, handleSubmit, reset, watch, setValue } = useForm<FormValues>({
    defaultValues,
  })
  const transport = watch('transport')

  function openCreate() {
    setEditingServer(null)
    reset(defaultValues)
    setDialogOpen(true)
  }

  function openEdit(server: McpServer) {
    setEditingServer(server)
    reset(serverToForm(server))
    setDialogOpen(true)
  }

  const onSubmit = handleSubmit(async (values) => {
    const request = formToRequest(values)
    if (editingServer) {
      await updateServer.mutateAsync({ id: editingServer.id, data: request })
    } else {
      await createServer.mutateAsync(request)
    }
    setDialogOpen(false)
  })

  const isSaving = createServer.isPending || updateServer.isPending

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-4xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold">{t('mcpServers.title')}</h1>
              <p className="text-muted-foreground text-sm mt-1">{t('mcpServers.description')}</p>
            </div>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              {t('mcpServers.addServer')}
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('common.loading')}
            </div>
          ) : servers.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                <Plug className="h-10 w-10 text-muted-foreground" />
                <p className="text-muted-foreground">{t('mcpServers.noServers')}</p>
                <Button onClick={openCreate} variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  {t('mcpServers.addServer')}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {servers.map((server) => {
                const result = testResults[server.id]
                const isTestingThis = isTesting && pendingId === server.id
                return (
                  <Card key={server.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-base">{server.name}</CardTitle>
                          <Badge variant={server.enabled ? 'default' : 'secondary'}>
                            {server.enabled ? t('mcpServers.enabled') : t('mcpServers.disabled')}
                          </Badge>
                          <Badge variant="outline">{server.transport}</Badge>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            title={t('mcpServers.testServer')}
                            disabled={isTestingThis}
                            onClick={() => testServer(server.id)}
                          >
                            {isTestingThis ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <FlaskConical className="h-4 w-4" />
                            )}
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(server)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteConfirm(server)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    {server.description && (
                      <CardContent className="pt-0 text-sm text-muted-foreground">
                        {server.description}
                      </CardContent>
                    )}
                    <CardContent className="pt-0 flex flex-col gap-2">
                      <div className="text-xs text-muted-foreground font-mono">
                        {server.transport === 'stdio' && server.command && (
                          <span>
                            {server.command}
                            {server.args?.length ? ' ' + server.args.join(' ') : ''}
                          </span>
                        )}
                        {server.transport !== 'stdio' && server.url && <span>{server.url}</span>}
                      </div>

                      {result && (
                        <div
                          className={`flex flex-col gap-1 rounded-md p-2 text-sm ${
                            result.success
                              ? 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300'
                              : 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 font-medium">
                            {result.success ? (
                              <CheckCircle2 className="h-4 w-4 shrink-0" />
                            ) : (
                              <XCircle className="h-4 w-4 shrink-0" />
                            )}
                            {result.message}
                          </div>
                          {result.success && result.tools && result.tools.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1 pl-5">
                              {result.tools.map((tool) => (
                                <Badge key={tool} variant="secondary" className="font-mono text-xs">
                                  {tool}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingServer ? t('mcpServers.editServer') : t('mcpServers.addServer')}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>{t('common.name')}</Label>
              <Input {...register('name', { required: true })} placeholder="my-mcp-server" />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>{t('common.description')} ({t('common.optional')})</Label>
              <Input
                {...register('description')}
                placeholder={t('mcpServers.descriptionPlaceholder')}
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch
                checked={watch('enabled')}
                onCheckedChange={(v) => setValue('enabled', v)}
                id="enabled"
              />
              <Label htmlFor="enabled">{t('mcpServers.enabledLabel')}</Label>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>{t('mcpServers.transport')}</Label>
              <Select
                value={transport}
                onValueChange={(v) => setValue('transport', v as TransportType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stdio">stdio</SelectItem>
                  <SelectItem value="sse">SSE</SelectItem>
                  <SelectItem value="streamable_http">Streamable HTTP</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {transport === 'stdio' ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label>{t('mcpServers.command')}</Label>
                  <Input
                    {...register('command')}
                    placeholder="uvx"
                    className="font-mono text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t('mcpServers.args')} ({t('common.optional')})</Label>
                  <Input
                    {...register('args')}
                    placeholder="my-package arg1 arg2"
                    className="font-mono text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t('mcpServers.env')} ({t('common.optional')})</Label>
                  <textarea
                    {...register('env')}
                    rows={3}
                    placeholder={'API_KEY=xxx\nBASE_URL=http://localhost:8080'}
                    className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono resize-none"
                  />
                  <p className="text-xs text-muted-foreground">{t('mcpServers.envHint')}</p>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label>URL</Label>
                  <Input
                    {...register('url')}
                    placeholder="http://localhost:8080/mcp"
                    className="font-mono text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t('mcpServers.headers')} ({t('common.optional')})</Label>
                  <textarea
                    {...register('headers')}
                    rows={3}
                    placeholder={'Authorization=Bearer my-token\nX-Custom-Header=value'}
                    className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono resize-none"
                  />
                  <p className="text-xs text-muted-foreground">{t('mcpServers.headersHint')}</p>
                </div>
              </>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('mcpServers.deleteConfirmTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('mcpServers.deleteConfirmMessage').replace('{name}', deleteConfirm?.name ?? '')}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={deleteServer.isPending}
              onClick={async () => {
                if (deleteConfirm) {
                  await deleteServer.mutateAsync(deleteConfirm.id)
                  setDeleteConfirm(null)
                }
              }}
            >
              {deleteServer.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
