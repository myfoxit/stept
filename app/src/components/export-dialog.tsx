import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Download,
  FileType,
  FileCode,
  FileDown,
  FileOutput,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

export type ExportFormat = 'pdf' | 'html' | 'markdown' | 'docx';

interface ExportDialogProps {
  /** Function to perform the export */
  onExport: (format: ExportFormat) => Promise<void>;
  /** Optional trigger button - if not provided, uses default button */
  trigger?: React.ReactNode;
  /** Title for the dialog */
  title?: string;
  /** Description for the dialog */
  description?: string;
  /** Whether the trigger button is disabled */
  disabled?: boolean;
}

const exportOptions: {
  format: ExportFormat;
  label: string;
  description: string;
  icon: typeof FileType;
}[] = [
  {
    format: 'pdf',
    label: 'PDF Document',
    description: 'Best for printing and sharing',
    icon: FileType,
  },
  {
    format: 'docx',
    label: 'Word Document',
    description: 'Editable in Microsoft Word',
    icon: FileOutput,
  },
  {
    format: 'html',
    label: 'HTML File',
    description: 'View in any web browser',
    icon: FileCode,
  },
  {
    format: 'markdown',
    label: 'Markdown',
    description: 'Plain text with formatting',
    icon: FileDown,
  },
];

export function ExportDialog({
  onExport,
  trigger,
  title = 'Export',
  description = 'Choose a format to export your content.',
  disabled = false,
}: ExportDialogProps) {
  const [open, setOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);

  const handleExport = async (format: ExportFormat) => {
    setIsExporting(true);
    setExportingFormat(format);
    try {
      await onExport(format);
      toast.success(`Exported as ${format.toUpperCase()}`);
      setOpen(false);
    } catch (error) {
      console.error('Export failed:', error);
      toast.error(
        `Failed to export: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      setIsExporting(false);
      setExportingFormat(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" disabled={disabled}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-4">
          {exportOptions.map((option) => {
            const Icon = option.icon;
            const isCurrentlyExporting = exportingFormat === option.format;
            return (
              <Button
                key={option.format}
                variant="outline"
                className="w-full justify-start h-auto py-3 px-4"
                onClick={() => handleExport(option.format)}
                disabled={isExporting}
              >
                <div className="flex items-center gap-3 w-full">
                  {isCurrentlyExporting ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  ) : (
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div className="flex flex-col items-start">
                    <span className="font-medium">{option.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  </div>
                </div>
              </Button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
