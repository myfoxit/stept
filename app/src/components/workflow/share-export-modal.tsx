import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Copy,
  Check,
  Trash2,
  FileType,
  FileCode,
  FileDown,
  FileOutput,
  Loader2,
  Globe,
  Lock,
  UserPlus,
  Users,
  Code2,
} from 'lucide-react';
import { exportWorkflow, type ExportFormat } from '@/api/workflows';
import { useShare } from '@/hooks/use-share';

interface ShareExportModalProps {
  open: boolean;
  onClose: () => void;
  workflowId: string;
  workflowName: string;
  isPrivate?: boolean;
}

export function ShareExportModal({
  open,
  onClose,
  workflowId,
  workflowName,
  isPrivate,
}: ShareExportModalProps) {
  const [copied, setCopied] = React.useState(false);
  const [exportingFormat, setExportingFormat] = React.useState<ExportFormat | null>(null);

  // Share state
  const {
    settings,
    isLoading: shareLoading,
    togglePublic,
    isTogglingPublic,
    invite,
    isInviting,
    remove,
    updatePermission,
  } = useShare('workflow', workflowId);

  const [email, setEmail] = React.useState('');
  const [permission, setPermission] = React.useState<string>('view');
  const [inviteError, setInviteError] = React.useState<string | null>(null);
  const [embedSize, setEmbedSize] = React.useState<'small' | 'medium' | 'large'>('medium');
  const [embedMode, setEmbedMode] = React.useState<'slides' | 'movie' | 'expanded'>('slides');
  const [embedCopied, setEmbedCopied] = React.useState(false);

  const publicUrl = settings?.share_token
    ? `${window.location.origin}/public/workflow/${settings.share_token}`
    : '';

  const embedWidth = embedSize === 'small' ? '640px' : embedSize === 'medium' ? '800px' : '100%';
  const embedSrc = publicUrl
    ? `${publicUrl}/embed?mode=${embedMode}`
    : '';
  const embedCode = publicUrl
    ? `<iframe src="${embedSrc}" width="${embedWidth}" height="600" frameborder="0" allow="fullscreen" style="border: 0; border-radius: 8px;"></iframe>`
    : '';

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = async (format: ExportFormat) => {
    setExportingFormat(format);
    try {
      await exportWorkflow(workflowId, format, {
        embedImages: true,
        includeImages: true,
      });
    } catch (error) {
      console.error('Export failed:', error);
      alert(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setExportingFormat(null);
    }
  };

  const handleInvite = async () => {
    if (!email.trim()) return;
    setInviteError(null);
    try {
      await invite({ email: email.trim(), permission });
      setEmail('');
    } catch (err: any) {
      setInviteError(err?.response?.data?.detail || 'Failed to invite user');
    }
  };

  const handleInviteKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleInvite();
    }
  };

  const exportOptions = [
    {
      format: 'pdf' as ExportFormat,
      label: 'Export to PDF',
      icon: FileType,
      description: null,
    },
    {
      format: 'html' as ExportFormat,
      label: 'Export to HTML',
      icon: FileCode,
      description: 'Works well with Microsoft Word, Google Docs and other apps.',
    },
    {
      format: 'markdown' as ExportFormat,
      label: 'Export to Markdown',
      icon: FileDown,
      description: 'Works well with Notion, GitHub and other apps.',
    },
    {
      format: 'docx' as ExportFormat,
      label: 'Export to Microsoft Word',
      icon: FileOutput,
      description: null,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
              <span className="text-lg">🔗</span>
            </div>
            <span>{workflowName || 'Workflow'}</span>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="share" className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="share">Share</TabsTrigger>
            <TabsTrigger value="embed">Embed</TabsTrigger>
            <TabsTrigger value="export">Export</TabsTrigger>
          </TabsList>

          {/* ─── SHARE TAB ─── */}
          <TabsContent value="share" className="mt-4 space-y-4">
            {shareLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Visibility status */}
                <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
                  {isPrivate ? (
                    <>
                      <Lock className="h-4 w-4 text-amber-500" />
                      <span className="text-sm">
                        <span className="font-medium">Private</span> — only you can see this
                      </span>
                    </>
                  ) : (
                    <>
                      <Users className="h-4 w-4 text-blue-500" />
                      <span className="text-sm">
                        <span className="font-medium">Team</span> — visible to all project members
                      </span>
                    </>
                  )}
                </div>

                {/* Public link toggle */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {settings?.is_public ? (
                        <Globe className="h-4 w-4 text-green-600" />
                      ) : (
                        <Lock className="h-4 w-4 text-muted-foreground" />
                      )}
                      <Label htmlFor="wf-public-toggle" className="text-sm font-medium cursor-pointer">
                        Anyone with the link
                      </Label>
                    </div>
                    <Switch
                      id="wf-public-toggle"
                      checked={settings?.is_public ?? false}
                      onCheckedChange={(checked) => togglePublic(checked)}
                      disabled={isTogglingPublic}
                    />
                  </div>

                  {settings?.is_public && publicUrl && (
                    <div className="flex gap-2">
                      <Input
                        value={publicUrl}
                        readOnly
                        className="flex-1 text-xs font-mono bg-muted/50"
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                      />
                      <Button variant="outline" size="icon" onClick={() => handleCopy(publicUrl)}>
                        {copied ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  )}
                </div>

                <div className="border-t" />

                {/* Invite people */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <UserPlus className="h-4 w-4" />
                    Add people
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Email address"
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setInviteError(null); }}
                      onKeyDown={handleInviteKeyDown}
                      className="flex-1"
                    />
                    <Select value={permission} onValueChange={setPermission}>
                      <SelectTrigger className="w-[110px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="view">Can view</SelectItem>
                        <SelectItem value="edit">Can edit</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button onClick={handleInvite} disabled={!email.trim() || isInviting} size="sm">
                      {isInviting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
                    </Button>
                  </div>
                  {inviteError && <p className="text-xs text-destructive">{inviteError}</p>}
                </div>

                {/* Shared list */}
                {settings?.shared_with && settings.shared_with.length > 0 && (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {settings.shared_with.map((user) => (
                      <div key={user.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                            {(user.user_name || user.email)[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{user.user_name || user.email}</p>
                            {user.user_name && <p className="text-xs text-muted-foreground truncate">{user.email}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Select value={user.permission} onValueChange={(val) => updatePermission({ shareId: user.id, permission: val })}>
                            <SelectTrigger className="h-7 w-[90px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="view">Can view</SelectItem>
                              <SelectItem value="edit">Can edit</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => remove(user.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Summary */}
                <div className="rounded-md bg-muted/50 px-3 py-2">
                  <p className="text-xs text-muted-foreground">
                    {settings?.is_public
                      ? 'Anyone with the link can view'
                      : settings?.shared_with?.length
                        ? `Shared with ${settings.shared_with.length} ${settings.shared_with.length === 1 ? 'person' : 'people'}`
                        : 'Only project members can access'}
                  </p>
                </div>
              </>
            )}
          </TabsContent>

          {/* ─── EMBED TAB ─── */}
          <TabsContent value="embed" className="mt-4 space-y-4">
            {settings?.is_public && embedCode ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Embed this workflow in your website or documentation.
                </p>

                {/* Live preview */}
                <div className="rounded-lg border bg-muted/30 p-2">
                  <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5 px-1">
                    <Code2 className="h-3 w-3" /> Preview
                  </div>
                  <div className="rounded-md border bg-white dark:bg-slate-900 overflow-hidden" style={{ height: 420 }}>
                    <iframe
                      key={`${embedSrc}-${embedMode}`}
                      src={embedSrc}
                      title="Embed preview"
                      className="w-full h-full border-0"
                    />
                  </div>
                </div>

                {/* Viewing mode selector */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Viewing mode</Label>
                  <div className="flex gap-1.5 flex-wrap">
                    {([
                      ['slides', 'Slides'],
                      ['movie', 'Movie'],
                      ['expanded', 'Expanded'],
                    ] as const).map(([value, label]) => (
                      <button
                        key={value}
                        onClick={() => setEmbedMode(value)}
                        className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                          embedMode === value
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:bg-muted/50'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Size selector */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Size</Label>
                  <div className="flex gap-1.5 flex-wrap">
                    {([
                      ['small', 'Small (640px)'],
                      ['medium', 'Medium (800px)'],
                      ['large', 'Large (100%)'],
                    ] as const).map(([value, label]) => (
                      <button
                        key={value}
                        onClick={() => setEmbedSize(value)}
                        className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                          embedSize === value
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:bg-muted/50'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Code block */}
                <div className="relative">
                  <pre className="rounded-lg bg-slate-900 p-3 overflow-x-auto text-xs text-slate-300 font-mono leading-relaxed whitespace-pre-wrap break-all">
                    {embedCode}
                  </pre>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="absolute top-2 right-2 h-7 text-xs"
                    onClick={() => {
                      navigator.clipboard.writeText(embedCode);
                      setEmbedCopied(true);
                      setTimeout(() => setEmbedCopied(false), 2000);
                    }}
                  >
                    {embedCopied ? <><Check className="h-3 w-3 mr-1" /> Copied</> : <><Copy className="h-3 w-3 mr-1" /> Copy</>}
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  The workflow must have a public link enabled for embedding to work.
                </p>
              </>
            ) : (
              <div className="py-6 text-center">
                <Lock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium mb-1">Enable public link first</p>
                <p className="text-xs text-muted-foreground">
                  Go to the Share tab and enable "Anyone with the link" to get an embed code.
                </p>
              </div>
            )}
          </TabsContent>

          {/* ─── EXPORT TAB ─── */}
          <TabsContent value="export" className="mt-4 space-y-2">
            <p className="text-sm text-muted-foreground mb-4">
              View in other formats. These options do not automatically update.
            </p>

            {exportOptions.map((option) => (
              <div
                key={option.format}
                className="flex items-center justify-between rounded-lg border p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <div className="flex items-center gap-3">
                  <option.icon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                  <div>
                    <span className="font-medium">{option.label}</span>
                    {option.description && (
                      <p className="text-xs text-muted-foreground">{option.description}</p>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport(option.format)}
                  disabled={exportingFormat !== null}
                >
                  {exportingFormat === option.format ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Export'
                  )}
                </Button>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
