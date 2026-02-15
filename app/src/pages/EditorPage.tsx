import { useParams } from 'react-router-dom';
import { NotionEditor } from '@/components/tiptap-templates/simple/notion-editor';
import { Button } from '@/components/ui/button';
import { SiteHeader } from '@/components/site-header';
import { IconDownload, IconShare, IconEye } from '@tabler/icons-react';
import {
  PageLayoutSelector,
  type PageLayout,
} from '@/components/page-layout-selector';
import { useState, useEffect, useMemo } from 'react';
import { useDocument, useUpdateDocumentLayout, useDocumentLock, useAcquireDocumentLock, useReleaseDocumentLock } from '@/hooks/api/documents';
import { exportDocument, type DocumentExportFormat } from '@/api/documents';
import { ExportDialog } from '@/components/export-dialog';
import { ShareDialog } from '@/components/share-dialog';
import { useChat } from '@/components/Chat/ChatContext';
import { useProject } from '@/providers/project-provider';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { IconLock } from '@tabler/icons-react';
import { ContextLinkPanel } from '@/components/ContextLinks/ContextLinkPanel';
import { CommentButton } from '@/components/Comments/CommentButton';
import { CommentPanel } from '@/components/Comments/CommentPanel';
import { useAuth } from '@/providers/auth-provider';

export default function EditorPage() {
  const { docId } = useParams<{ docId: string }>();
  const { data: doc } = useDocument(docId!);
  const { data: lockStatus } = useDocumentLock(docId!);
  const acquireLock = useAcquireDocumentLock(docId!);
  const releaseLock = useReleaseDocumentLock(docId!);
  const { setContext } = useChat();
  const { selectedProjectId } = useProject();
  const { user } = useAuth();

  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(0);

  const [pageLayout, setPageLayout] = useState<PageLayout>('full');
  const updateLayout = useUpdateDocumentLayout(docId!);

  const isPermissionReadOnly = useMemo(() => {
    if (!doc) return false;
    return (doc as any).permission === 'view';
  }, [doc]);

  const isLockedByOther = lockStatus?.locked && !lockStatus?.is_mine;
  const isReadOnly = isPermissionReadOnly || !!isLockedByOther;

  // Auto-acquire lock when opening for editing
  useEffect(() => {
    if (!docId || isPermissionReadOnly) return;
    acquireLock.mutate();
    return () => {
      releaseLock.mutate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, isPermissionReadOnly]);

  // Release lock on page unload
  useEffect(() => {
    if (!docId || isPermissionReadOnly) return;
    const handleUnload = () => {
      navigator.sendBeacon?.(`/api/v1/documents/${docId}/unlock`);
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [docId, isPermissionReadOnly]);

  // Set chat context when viewing a document
  useEffect(() => {
    if (docId) {
      setContext({ document_id: docId, project_id: selectedProjectId || undefined });
    }
    return () => setContext(null);
  }, [docId, setContext]);

  // Initialize from doc
  useEffect(() => {
    if (doc?.page_layout) {
      setPageLayout(doc.page_layout as PageLayout);
    }
  }, [doc?.page_layout]);

  // Apply globally for CSS
  useEffect(() => {
    document.documentElement.setAttribute('data-page-layout', pageLayout);
    return () => document.documentElement.removeAttribute('data-page-layout');
  }, [pageLayout]);

  const handleLayoutChange = (value: PageLayout) => {
    if (isReadOnly) return;
    setPageLayout(value);
    if (docId) updateLayout.mutate(value);
  };

  const handleExport = async (format: DocumentExportFormat) => {
    if (!docId) return;
    await exportDocument(docId, format, { pageLayout });
  };

  return (
    <div>
      <SiteHeader name="Editor">
        {isReadOnly && (
          <Badge variant="secondary" className="gap-1 text-xs">
            <IconEye className="h-3 w-3" />
            View only
          </Badge>
        )}

        {!isReadOnly && (
          <PageLayoutSelector value={pageLayout} onChange={handleLayoutChange} />
        )}

        {!isReadOnly && (
          <ShareDialog
            resourceType="document"
            resourceId={docId!}
            resourceName={doc?.name || 'Document'}
            isPrivate={doc?.is_private}
            trigger={
              <Button variant="outline" size="sm">
                <IconShare className="h-4 w-4 mr-2" />
                Share
              </Button>
            }
          />
        )}
        
        <ExportDialog
          onExport={handleExport}
          title="Export Document"
          description="Choose a format to export your document."
          trigger={
            <Button variant="outline" size="sm">
              <IconDownload className="h-4 w-4 mr-2" />
              Export
            </Button>
          }
        />

        {selectedProjectId && docId && (
          <CommentButton count={commentCount} onClick={() => setCommentsOpen(true)} />
        )}
      </SiteHeader>
      {isLockedByOther && (
        <div className="mx-auto max-w-4xl px-4 pt-4">
          <Alert variant="destructive" className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <IconLock className="h-4 w-4" />
              <AlertDescription>
                {lockStatus?.locked_by_name || 'Someone'} is currently editing this document.
              </AlertDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                acquireLock.mutate(true);
              }}
              className="ml-4 shrink-0"
            >
              Take over
            </Button>
          </Alert>
        </div>
      )}
      {selectedProjectId && docId && (
        <div className="mx-auto max-w-4xl px-4 pt-4">
          <ContextLinkPanel projectId={selectedProjectId} resourceType="document" resourceId={docId} />
        </div>
      )}
      <NotionEditor docId={docId as string} readOnly={isReadOnly} />

      {selectedProjectId && docId && user && (
        <CommentPanel
          open={commentsOpen}
          onOpenChange={setCommentsOpen}
          projectId={selectedProjectId}
          resourceType="document"
          resourceId={docId}
          currentUserId={user.id}
          onCountChange={setCommentCount}
        />
      )}
    </div>
  );
}
