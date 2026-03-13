import { useState, useEffect } from 'react';
import { History, RotateCcw, Clock, FileText, Layers, AlertTriangle } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useDocumentVersions, useRestoreDocumentVersion } from '@/hooks/api/documents';
import { useWorkflowVersions, useRestoreWorkflowVersion } from '@/hooks/api/workflows';
import type { DocumentVersionRead } from '@/api/documents';
import type { WorkflowVersionRead } from '@/api/workflows';

interface VersionHistoryPanelProps {
  open: boolean;
  onClose: () => void;
  docId?: string;
  workflowId?: string;
  onRestore?: () => void;
}

export function VersionHistoryPanel({
  open,
  onClose,
  docId,
  workflowId,
  onRestore,
}: VersionHistoryPanelProps) {
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const isDocument = !!docId;

  // Document version queries
  const docVersions = useDocumentVersions(docId || '');
  const docRestore = useRestoreDocumentVersion(docId || '');

  // Workflow version queries
  const wfVersions = useWorkflowVersions(workflowId || '');
  const wfRestore = useRestoreWorkflowVersion(workflowId || '');

  const versions = isDocument
    ? (docVersions.data as (DocumentVersionRead | WorkflowVersionRead)[] | undefined)
    : (wfVersions.data as (DocumentVersionRead | WorkflowVersionRead)[] | undefined);
  const isLoading = isDocument ? docVersions.isLoading : wfVersions.isLoading;
  const isRestoring = isDocument ? docRestore.isPending : wfRestore.isPending;

  const selectedVersion = versions?.find((v) => v.id === selectedVersionId);

  // Refetch versions when the panel opens
  useEffect(() => {
    if (open) {
      if (isDocument) docVersions.refetch();
      else wfVersions.refetch();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Clear selection when panel closes
  useEffect(() => {
    if (!open) {
      setSelectedVersionId(null);
      setConfirmingId(null);
    }
  }, [open]);

  const handleRestore = (versionId: string) => {
    const mutation = isDocument ? docRestore : wfRestore;
    mutation.mutate(versionId, {
      onSuccess: () => {
        setConfirmingId(null);
        setSelectedVersionId(null);
        onRestore?.();
        onClose();
      },
      onError: () => {
        setConfirmingId(null);
      },
    });
  };

  const handleClose = () => {
    setSelectedVersionId(null);
    onClose();
  };

  // Sequential display number: versions are sorted newest-first from the API,
  // so the first item is the most recent snapshot. We show them as
  // "Revision N" counting down from total, so the oldest is #1.
  const totalVersions = versions?.length ?? 0;

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
        <SheetContent className="flex w-[380px] flex-col sm:w-[420px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Version History
            </SheetTitle>
          </SheetHeader>

          <div className="mt-4 flex-1 overflow-hidden">
            {/* Current version indicator */}
            <div className="mb-3 flex items-center gap-2 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-3 py-2.5">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                Current version
              </span>
              <span className="text-xs text-emerald-600/70 dark:text-emerald-400/70 ml-auto">
                Live
              </span>
            </div>

            <Separator className="mb-3" />

            {isLoading ? (
              <div className="space-y-3 px-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="space-y-2 rounded-md border p-3">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                ))}
              </div>
            ) : !versions || versions.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <History className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  No version history yet
                </p>
                <p className="text-xs text-muted-foreground/60">
                  Versions are created automatically when you edit
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[calc(100vh-280px)]">
                <div className="space-y-1.5 pr-3">
                  {versions.map((version, index) => {
                    const isSelected = selectedVersionId === version.id;
                    const wfVersion = version as WorkflowVersionRead;
                    const displayNumber = totalVersions - index;
                    const createdDate = new Date(version.created_at);
                    return (
                      <div
                        key={version.id}
                        className={`rounded-md border transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/5 shadow-sm'
                            : 'border-transparent hover:border-border hover:bg-muted/40'
                        }`}
                      >
                        <button
                          onClick={() =>
                            setSelectedVersionId(
                              isSelected ? null : version.id
                            )
                          }
                          className="w-full px-3 py-2.5 text-left"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {isDocument ? (
                                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                              ) : (
                                <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                              <span className="text-sm font-medium">
                                Revision {displayNumber}
                              </span>
                            </div>
                            {!isDocument && wfVersion.total_steps != null && (
                              <Badge variant="outline" className="text-xs">
                                {wfVersion.total_steps} steps
                              </Badge>
                            )}
                            {isDocument && (version as DocumentVersionRead).byte_size != null && (
                              <span className="text-xs text-muted-foreground">
                                {formatBytes((version as DocumentVersionRead).byte_size!)}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span title={format(createdDate, 'PPpp')}>
                              {formatDistanceToNow(createdDate, { addSuffix: true })}
                            </span>
                          </div>
                          {!isDocument && wfVersion.change_summary && (
                            <p className="mt-1.5 text-xs text-muted-foreground/80 italic">
                              {wfVersion.change_summary}
                            </p>
                          )}
                        </button>

                        {/* Inline restore flow when selected */}
                        {isSelected && (
                          <div className="px-3 pb-2.5 space-y-2">
                            {confirmingId === version.id ? (
                              <>
                                <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-2.5 py-2 text-xs text-amber-800 dark:text-amber-200">
                                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                  <span>Your current content will be saved first. You can switch back later.</span>
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="flex-1"
                                    onClick={() => setConfirmingId(null)}
                                    disabled={isRestoring}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    size="sm"
                                    className="flex-1"
                                    onClick={() => handleRestore(version.id)}
                                    disabled={isRestoring}
                                  >
                                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                                    {isRestoring ? 'Restoring…' : 'Confirm'}
                                  </Button>
                                </div>
                              </>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full"
                                onClick={() => setConfirmingId(version.id)}
                                disabled={isRestoring}
                              >
                                <RotateCcw className="mr-2 h-3.5 w-3.5" />
                                Restore this version
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>
        </SheetContent>
      </Sheet>

    </>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
