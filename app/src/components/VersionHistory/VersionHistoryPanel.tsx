import { useState, useEffect } from 'react';
import { History, RotateCcw, Clock, User, ChevronLeft } from 'lucide-react';
import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useDocumentVersions, useDocumentVersion, useRestoreDocumentVersion } from '@/hooks/api/documents';
import { useWorkflowVersions, useWorkflowVersion, useRestoreWorkflowVersion } from '@/hooks/api/workflows';
import type { DocumentVersionRead } from '@/api/documents';
import type { WorkflowVersionRead } from '@/api/workflows';

// Shared type for both version kinds
type AnyVersion = DocumentVersionRead | WorkflowVersionRead;

interface VersionHistoryPanelProps {
  open: boolean;
  onClose: () => void;
  docId?: string;
  workflowId?: string;
  /** Called with version content when user clicks a version (for live preview) */
  onPreview?: (content: Record<string, any> | null, versionInfo: VersionPreviewInfo | null) => void;
  /** Called after a successful restore */
  onRestore?: () => void;
}

export interface VersionPreviewInfo {
  id: string;
  displayNumber: number;
  createdAt: string;
  createdByName: string | null;
}

function formatVersionDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return `Today, ${format(date, 'h:mm a')}`;
  if (isYesterday(date)) return `Yesterday, ${format(date, 'h:mm a')}`;
  return format(date, 'MMM d, yyyy · h:mm a');
}

/** Group versions by date label */
function groupByDate(versions: AnyVersion[]): { label: string; versions: AnyVersion[] }[] {
  const groups: Map<string, AnyVersion[]> = new Map();
  for (const v of versions) {
    const date = new Date(v.created_at);
    let label: string;
    if (isToday(date)) label = 'Today';
    else if (isYesterday(date)) label = 'Yesterday';
    else label = format(date, 'MMMM d, yyyy');
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(v);
  }
  return Array.from(groups.entries()).map(([label, versions]) => ({ label, versions }));
}

export function VersionHistoryPanel({
  open,
  onClose,
  docId,
  workflowId,
  onPreview,
  onRestore,
}: VersionHistoryPanelProps) {
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  const isDocument = !!docId;

  // Queries
  const docVersions = useDocumentVersions(docId || '');
  const docVersion = useDocumentVersion(docId || '', selectedVersionId);
  const docRestore = useRestoreDocumentVersion(docId || '');

  const wfVersions = useWorkflowVersions(workflowId || '');
  const wfVersion = useWorkflowVersion(workflowId || '', selectedVersionId);
  const wfRestore = useRestoreWorkflowVersion(workflowId || '');

  const versions = (isDocument ? docVersions.data : wfVersions.data) as AnyVersion[] | undefined;
  const isLoading = isDocument ? docVersions.isLoading : wfVersions.isLoading;
  const isRestoring = isDocument ? docRestore.isPending : wfRestore.isPending;

  // When a version's content finishes loading, push it to the parent for preview
  const fetchedVersion = isDocument ? docVersion.data : wfVersion.data;
  useEffect(() => {
    if (!fetchedVersion || !selectedVersionId || !onPreview) return;
    const totalVersions = versions?.length ?? 0;
    const index = versions?.findIndex((v) => v.id === selectedVersionId) ?? -1;
    const displayNumber = index >= 0 ? totalVersions - index : 0;
    const v = fetchedVersion as any;
    onPreview(
      v.content ?? v.steps_snapshot ?? null,
      {
        id: selectedVersionId,
        displayNumber,
        createdAt: v.created_at,
        createdByName: v.created_by_name ?? null,
      },
    );
  }, [fetchedVersion, selectedVersionId]);

  // Refetch list when panel opens
  useEffect(() => {
    if (open) {
      if (isDocument) docVersions.refetch();
      else wfVersions.refetch();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Clear selection + preview when panel closes
  useEffect(() => {
    if (!open) {
      setSelectedVersionId(null);
      onPreview?.(null, null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSelect = (versionId: string) => {
    if (versionId === selectedVersionId) {
      // Deselect → back to current
      setSelectedVersionId(null);
      onPreview?.(null, null);
    } else {
      setSelectedVersionId(versionId);
      // Content will be pushed via the useEffect above once fetched
    }
  };

  const handleRestore = () => {
    if (!selectedVersionId) return;
    const mutation = isDocument ? docRestore : wfRestore;
    mutation.mutate(selectedVersionId, {
      onSuccess: () => {
        setSelectedVersionId(null);
        onPreview?.(null, null);
        onRestore?.();
        onClose();
      },
    });
  };

  const handleBackToCurrent = () => {
    setSelectedVersionId(null);
    onPreview?.(null, null);
  };

  const totalVersions = versions?.length ?? 0;
  const groups = versions ? groupByDate(versions) : [];

  // Find display info for selected version
  const selectedIndex = versions?.findIndex((v) => v.id === selectedVersionId) ?? -1;
  const selectedDisplayNumber = selectedIndex >= 0 ? totalVersions - selectedIndex : 0;
  const selectedVersionData = versions?.find((v) => v.id === selectedVersionId);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-[360px] flex-col p-0 sm:w-[400px] gap-0">
        {/* Header */}
        <div className="px-4 pt-4 pb-3">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4" />
              Version history
            </SheetTitle>
          </SheetHeader>
        </div>

        {/* Preview banner when a version is selected */}
        {selectedVersionId && selectedVersionData && (
          <div className="border-y bg-muted/30 px-4 py-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <span className="font-medium">Revision {selectedDisplayNumber}</span>
                <span className="text-muted-foreground ml-1.5">
                  · {formatVersionDate(selectedVersionData.created_at)}
                </span>
              </div>
            </div>
            {(selectedVersionData as any).created_by_name && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <User className="h-3 w-3" />
                {(selectedVersionData as any).created_by_name}
              </div>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={handleBackToCurrent}
              >
                <ChevronLeft className="mr-1 h-3 w-3" />
                Back to current
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={handleRestore}
                disabled={isRestoring}
              >
                <RotateCcw className="mr-1 h-3 w-3" />
                {isRestoring ? 'Restoring…' : 'Restore this version'}
              </Button>
            </div>
          </div>
        )}

        <Separator />

        {/* Version list */}
        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="space-y-4 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-10 w-full rounded-md" />
                </div>
              ))}
            </div>
          ) : !versions || versions.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center px-4">
              <History className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No versions yet</p>
              <p className="text-xs text-muted-foreground/60">
                Versions are saved automatically as you edit
              </p>
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="p-4 space-y-4">
                {/* Current version pill */}
                <button
                  onClick={handleBackToCurrent}
                  className={`w-full rounded-lg px-3 py-2.5 text-left transition-all border ${
                    !selectedVersionId
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-transparent hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${!selectedVersionId ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} />
                    <span className={`text-sm font-medium ${!selectedVersionId ? 'text-foreground' : 'text-muted-foreground'}`}>
                      Current version
                    </span>
                  </div>
                </button>

                {/* Grouped version list */}
                {groups.map((group) => (
                  <div key={group.label}>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5 px-1">
                      {group.label}
                    </p>
                    <div className="space-y-0.5">
                      {group.versions.map((version) => {
                        const idx = versions.indexOf(version);
                        const displayNumber = totalVersions - idx;
                        const isSelected = selectedVersionId === version.id;
                        const isFetching = isSelected && (isDocument ? docVersion.isFetching : wfVersion.isFetching);
                        const wfV = version as WorkflowVersionRead;
                        const createdDate = new Date(version.created_at);

                        return (
                          <button
                            key={version.id}
                            onClick={() => handleSelect(version.id)}
                            className={`w-full rounded-lg px-3 py-2 text-left transition-all border ${
                              isSelected
                                ? 'border-primary/40 bg-primary/5'
                                : 'border-transparent hover:bg-muted/40'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {isFetching ? (
                                  <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                                ) : (
                                  <div className={`h-2 w-2 rounded-full ${isSelected ? 'bg-primary' : 'bg-muted-foreground/20'}`} />
                                )}
                                <span className="text-sm font-medium">
                                  Revision {displayNumber}
                                </span>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {format(createdDate, 'h:mm a')}
                              </span>
                            </div>

                            {/* User name */}
                            {(version as any).created_by_name && (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1 ml-4">
                                <User className="h-3 w-3" />
                                {(version as any).created_by_name}
                              </div>
                            )}

                            {/* Workflow-specific: step count + summary */}
                            {!isDocument && wfV.total_steps != null && (
                              <div className="text-xs text-muted-foreground mt-1 ml-4">
                                {wfV.total_steps} steps
                                {wfV.change_summary && (
                                  <span className="ml-1.5">· {wfV.change_summary}</span>
                                )}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
