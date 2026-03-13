import { useState } from 'react';
import { History, RotateCcw, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  const [confirmOpen, setConfirmOpen] = useState(false);

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

  const handleRestore = () => {
    if (!selectedVersionId) return;
    const mutation = isDocument ? docRestore : wfRestore;
    mutation.mutate(selectedVersionId, {
      onSuccess: () => {
        setConfirmOpen(false);
        setSelectedVersionId(null);
        onRestore?.();
        onClose();
      },
    });
  };

  const handleClose = () => {
    setSelectedVersionId(null);
    onClose();
  };

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
            <div className="mb-3 flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
              <Badge variant="secondary" className="text-xs">
                Current
              </Badge>
              <span className="text-sm text-muted-foreground">
                Live version
              </span>
            </div>

            <Separator className="mb-3" />

            {isLoading ? (
              <div className="space-y-3 px-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-40" />
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
                <div className="space-y-1 pr-3">
                  {versions.map((version) => {
                    const isSelected = selectedVersionId === version.id;
                    const wfVersion = version as WorkflowVersionRead;
                    return (
                      <button
                        key={version.id}
                        onClick={() =>
                          setSelectedVersionId(
                            isSelected ? null : version.id
                          )
                        }
                        className={`w-full rounded-md px-3 py-2.5 text-left transition-colors ${
                          isSelected
                            ? 'bg-primary/10 ring-1 ring-primary/30'
                            : 'hover:bg-muted/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">
                            Version {version.version_number}
                          </span>
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
                          {formatDistanceToNow(new Date(version.created_at), {
                            addSuffix: true,
                          })}
                        </div>
                        {!isDocument && wfVersion.change_summary && (
                          <p className="mt-1 text-xs text-muted-foreground/80">
                            {wfVersion.change_summary}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Restore button */}
          {selectedVersionId && selectedVersion && (
            <div className="border-t pt-3">
              <Button
                className="w-full"
                onClick={() => setConfirmOpen(true)}
                disabled={isRestoring}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Restore version {selectedVersion.version_number}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore version?</AlertDialogTitle>
            <AlertDialogDescription>
              This will save your current version and restore to version{' '}
              {selectedVersion?.version_number}. You can always switch back
              later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRestoring}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore} disabled={isRestoring}>
              {isRestoring ? 'Restoring…' : 'Restore'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
