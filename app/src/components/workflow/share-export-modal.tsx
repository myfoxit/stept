import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  IconCopy,
  IconCheck,
  IconFileTypePdf,
  IconFileTypeHtml,
  IconMarkdown,
  IconFileTypeDoc,
  IconLoader2,
} from '@tabler/icons-react';
import { exportWorkflow, type ExportFormat } from '@/api/workflows';

interface ShareExportModalProps {
  open: boolean;
  onClose: () => void;
  workflowId: string;
  workflowName: string;
}

export function ShareExportModal({
  open,
  onClose,
  workflowId,
  workflowName,
}: ShareExportModalProps) {
  const [copied, setCopied] = React.useState(false);
  const [exportingFormat, setExportingFormat] = React.useState<ExportFormat | null>(null);
  
  const shareUrl = `${window.location.origin}/workflow/${workflowId}`;
  const embedCode = `<iframe src="${shareUrl}/embed" width="100%" height="600" frameborder="0"></iframe>`;

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

  const exportOptions = [
    {
      format: 'pdf' as ExportFormat,
      label: 'Export to PDF',
      icon: IconFileTypePdf,
      description: null,
      isPro: false,
    },
    {
      format: 'html' as ExportFormat,
      label: 'Export to HTML',
      icon: IconFileTypeHtml,
      description: 'Works well with Microsoft Word, Google Docs and other apps.',
      isPro: true,
    },
    {
      format: 'markdown' as ExportFormat,
      label: 'Export to Markdown',
      icon: IconMarkdown,
      description: 'Works well with Notion, GitHub and other apps.',
      isPro: true,
    },
    {
      format: 'docx' as ExportFormat,
      label: 'Export to Microsoft Word',
      icon: IconFileTypeDoc,
      description: null,
      isPro: true,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
              <span className="text-lg">🔗</span>
            </div>
            <span>{workflowName || 'Workflow'}</span>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="export" className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="share">Share</TabsTrigger>
            <TabsTrigger value="embed">Embed</TabsTrigger>
            <TabsTrigger value="export">Export</TabsTrigger>
          </TabsList>

          <TabsContent value="share" className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Share this link with others to give them access to view this workflow.
            </p>
            <div className="flex gap-2">
              <Input value={shareUrl} readOnly className="flex-1" />
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleCopy(shareUrl)}
              >
                {copied ? (
                  <IconCheck className="h-4 w-4 text-green-500" />
                ) : (
                  <IconCopy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Coming soon: Fine-grained access controls and password protection.
            </p>
          </TabsContent>

          <TabsContent value="embed" className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Embed this workflow in your website or documentation.
            </p>
            <div className="flex gap-2">
              <Input value={embedCode} readOnly className="flex-1 font-mono text-xs" />
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleCopy(embedCode)}
              >
                {copied ? (
                  <IconCheck className="h-4 w-4 text-green-500" />
                ) : (
                  <IconCopy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Coming soon: Customizable embed options and themes.
            </p>
          </TabsContent>

          <TabsContent value="export" className="mt-4 space-y-2">
            <p className="text-sm text-muted-foreground mb-4">
              View in other formats. These options do not automatically update.
            </p>
            
            {exportOptions.map((option) => (
              <div
                key={option.format}
                className="flex items-center justify-between rounded-lg border p-3 hover:bg-slate-50"
              >
                <div className="flex items-center gap-3">
                  <option.icon className="h-5 w-5 text-slate-600" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{option.label}</span>
                     
                    </div>
                    {option.description && (
                      <p className="text-xs text-muted-foreground">
                        {option.description}
                      </p>
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
                    <IconLoader2 className="h-4 w-4 animate-spin" />
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
