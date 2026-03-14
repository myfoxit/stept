import { useState, useEffect } from 'react';
import { History, RotateCcw, Clock, User, X } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDocumentVersions, useDocumentVersion, useRestoreDocumentVersion } from '@/hooks/api/documents';
import { useWorkflowVersions, useWorkflowVersion, useRestoreWorkflowVersion } from '@/hooks/api/workflows';
import type { DocumentVersionRead } from '@/api/documents';
import type { WorkflowVersionRead } from '@/api/workflows';

type AnyVersion = DocumentVersionRead | WorkflowVersionRead;

interface VersionHistoryPanelProps {
  open: boolean;
  onClose: () => void;
  docId?: string;
  workflowId?: string;
  onPreview?: (content: Record<string, any> | null, versionInfo: VersionPreviewInfo | null) => void;
  onRestore?: () => void;
}

export interface VersionPreviewInfo {
  id: string;
  displayNumber: number;
  createdAt: string;
  createdByName: string | null;
}

function formatTime(dateStr: string): string {
  return format(new Date(dateStr), 'h:mm a');
}

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

  const docVersions = useDocumentVersions(docId || '');
  const docVersion = useDocumentVersion(docId || '', selectedVersionId);
  const docRestore = useRestoreDocumentVersion(docId || '');

  const wfVersions = useWorkflowVersions(workflowId || '');
  const wfVersion = useWorkflowVersion(workflowId || '', selectedVersionId);
  const wfRestore = useRestoreWorkflowVersion(workflowId || '');

  const versions = (isDocument ? docVersions.data : wfVersions.data) as AnyVersion[] | undefined;
  const isLoading = isDocument ? docVersions.isLoading : wfVersions.isLoading;
  const isRestoring = isDocument ? docRestore.isPending : wfRestore.isPending;

  // Push preview content to parent when version data arrives
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

  // Refetch when panel opens
  useEffect(() => {
    if (open) {
      if (isDocument) docVersions.refetch();
      else wfVersions.refetch();
    }
  }, [open]);

  // Clear on close
  useEffect(() => {
    if (!open) {
      setSelectedVersionId(null);
      onPreview?.(null, null);
    }
  }, [open]);

  const handleSelect = (versionId: string) => {
    if (versionId === selectedVersionId) {
      setSelectedVersionId(null);
      onPreview?.(null, null);
    } else {
      setSelectedVersionId(versionId);
    }
  };

  const handleBackToCurrent = () => {
    setSelectedVersionId(null);
    onPreview?.(null, null);
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

  const totalVersions = versions?.length ?? 0;
  const groups = versions ? groupByDate(versions) : [];

  if (!open) return null;

  return (
    <div className="flex h-full w-[300px] shrink-0 flex-col border-l bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <History className="h-4 w-4" />
          Version history
        </h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Close version history" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Restore bar when version selected */}
      {selectedVersionId && (
        <div className="px-3 py-2 border-b bg-muted/30">
          <Button
            size="sm"
            className="w-full h-8 text-xs"
            onClick={handleRestore}
            disabled={isRestoring}
          >
            <RotateCcw className="mr-1.5 h-3 w-3" />
            {isRestoring ? 'Restoring…' : 'Restore this version'}
          </Button>
        </div>
      )}

      {/* Version list */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-9 w-full rounded-md" />
                </div>
              ))}
            </div>
          ) : !versions || versions.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <History className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">No versions yet</p>
              <p className="text-[11px] text-muted-foreground/60">
                Saved automatically as you edit
              </p>
            </div>
          ) : (
            <>
              {/* Current version */}
              <button
                onClick={handleBackToCurrent}
                className={`w-full rounded-md px-2.5 py-2 text-left transition-colors ${
                  !selectedVersionId
                    ? 'bg-primary/8 ring-1 ring-primary/20'
                    : 'hover:bg-muted/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`h-1.5 w-1.5 rounded-full ${!selectedVersionId ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} />
                  <span className="text-xs font-medium">Current version</span>
                </div>
              </button>

              {/* Grouped versions */}
              {groups.map((group) => (
                <div key={group.label}>
                  <p className="text-[11px] font-medium text-muted-foreground mb-1 px-1 uppercase tracking-wider">
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    {group.versions.map((version) => {
                      const idx = versions.indexOf(version);
                      const displayNumber = totalVersions - idx;
                      const isSelected = selectedVersionId === version.id;
                      const isFetching = isSelected && (isDocument ? docVersion.isFetching : wfVersion.isFetching);
                      const wfV = version as WorkflowVersionRead;

                      return (
                        <button
                          key={version.id}
                          onClick={() => handleSelect(version.id)}
                          className={`w-full rounded-md px-2.5 py-2 text-left transition-colors ${
                            isSelected
                              ? 'bg-primary/8 ring-1 ring-primary/20'
                              : 'hover:bg-muted/50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {isFetching ? (
                                <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                              ) : (
                                <div className={`h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-primary' : 'bg-muted-foreground/25'}`} />
                              )}
                              <span className="text-xs font-medium">
                                Revision {displayNumber}
                              </span>
                            </div>
                            <span className="text-[11px] text-muted-foreground">
                              {formatTime(version.created_at)}
                            </span>
                          </div>

                          {(version as any).created_by_name && (
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5 ml-3.5">
                              <User className="h-2.5 w-2.5" />
                              {(version as any).created_by_name}
                            </div>
                          )}

                          {!isDocument && wfV.total_steps != null && (
                            <div className="text-[11px] text-muted-foreground mt-0.5 ml-3.5">
                              {wfV.total_steps} steps
                              {wfV.change_summary && <span className="ml-1">· {wfV.change_summary}</span>}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
