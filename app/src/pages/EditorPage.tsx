import { Download, Eye, Folder as FolderIcon, History, Lock, Share2 } from 'lucide-react';
import { useParams } from "react-router-dom";
import { OndokiEditor } from "@/components/Editor/OndokiEditor";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import {
  PageLayoutSelector,
  type PageLayout,
} from "@/components/page-layout-selector";
import { useState, useEffect, useMemo } from "react";
import {
  useDocument,
  useUpdateDocumentLayout,
  useDocumentLock,
  useAcquireDocumentLock,
  useReleaseDocumentLock,
} from "@/hooks/api/documents";
import {
  exportDocument,
  exportDocumentPdfDom,
  type DocumentExportFormat,
} from "@/api/documents";
import { ExportDialog } from "@/components/export-dialog";
import { ShareDialog } from "@/components/share-dialog";
import { useChat } from "@/components/Chat/ChatContext";
import { useProject } from "@/providers/project-provider";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ContextLinkPanel } from "@/components/ContextLinks/ContextLinkPanel";
import { CommentButton } from "@/components/Comments/CommentButton";
import { FileViewer } from "@/components/FileViewer";
import { CommentPanel } from "@/components/Comments/CommentPanel";
import { useFolderTree } from "@/hooks/api/folders";
import { useAuth } from "@/providers/auth-provider";
import { ContentLanguageToggle } from "@/components/ui/content-language-toggle";
import { VersionHistoryPanel } from "@/components/VersionHistory/VersionHistoryPanel";

// Helper to find a folder name from the tree
function findFolderName(tree: any[], folderId: string): string | null {
  for (const node of tree) {
    if (node.id === folderId) return node.name || "Untitled";
    if (node.children?.length) {
      const found = findFolderName(node.children, folderId);
      if (found) return found;
    }
  }
  return null;
}

export default function EditorPage() {
  const { docId } = useParams<{ docId: string }>();
  const { data: doc } = useDocument(docId!);
  const { data: lockStatus } = useDocumentLock(docId!);
  const acquireLock = useAcquireDocumentLock(docId!);
  const releaseLock = useReleaseDocumentLock(docId!);
  const { setContext } = useChat();
  const { selectedProjectId } = useProject();
  const { user } = useAuth();
  const { data: sharedTree = [] } = useFolderTree(selectedProjectId, false);
  const { data: privateTree = [] } = useFolderTree(selectedProjectId, true);

  // Build breadcrumbs from doc folder
  const breadcrumbs = useMemo(() => {
    if (!doc) return undefined;
    const crumbs: { label: string }[] = [];
    const folderId = (doc as any).folder_id;
    if (folderId) {
      const folderName = findFolderName(
        [...sharedTree, ...privateTree],
        folderId,
      );
      if (folderName) crumbs.push({ label: folderName });
    }
    crumbs.push({ label: doc.name || "Untitled" });
    return crumbs.length > 0 ? crumbs : undefined;
  }, [doc, sharedTree, privateTree]);

  const folderName = useMemo(() => {
    if (!doc) return null;
    const folderId = (doc as any).folder_id;
    if (!folderId) return null;
    return findFolderName([...sharedTree, ...privateTree], folderId);
  }, [doc, sharedTree, privateTree]);

  const [commentsOpen, setCommentsOpen] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(0);

  // Translation preview
  const [contentLang, setContentLang] = useState("original");
  const [contentTranslating, setContentTranslating] = useState(false);

  const [pageLayout, setPageLayout] = useState<PageLayout>("document");
  const updateLayout = useUpdateDocumentLayout(docId!);

  const isPermissionReadOnly = useMemo(() => {
    if (!doc) return false;
    return (doc as any).permission === "view";
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
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [docId, isPermissionReadOnly]);

  // Set chat context when viewing a document
  useEffect(() => {
    if (docId) {
      setContext({
        document_id: docId,
        project_id: selectedProjectId || undefined,
      });
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
    document.documentElement.setAttribute("data-page-layout", pageLayout);
    return () => document.documentElement.removeAttribute("data-page-layout");
  }, [pageLayout]);

  const handleLayoutChange = (value: PageLayout) => {
    if (isReadOnly) return;
    setPageLayout(value);
    if (docId) updateLayout.mutate(value);
  };

  const handleExport = async (format: DocumentExportFormat) => {
    if (!docId) return;

    // For PDF: capture the browser DOM for pixel-perfect export
    if (format === "pdf") {
      const proseMirror = document.querySelector(".tiptap.ProseMirror");
      if (proseMirror) {
        const clone = proseMirror.cloneNode(true) as HTMLElement;
        // Strip pagination decorations
        clone
          .querySelectorAll(
            ".ondoki-page-break, .ondoki-first-page-header, .ondoki-pagination-gap, .tiptap-page-break, .tiptap-first-page-header, .tiptap-pagination-gap, [data-ondoki-pagination], [data-tiptap-pagination]",
          )
          .forEach((el) => el.remove());
        // Remove pagination wrapper padding
        clone.style.padding = "0";
        clone.style.width = "auto";
        clone.style.minHeight = "auto";
        await exportDocumentPdfDom(docId, clone.innerHTML, { pageLayout });
        return;
      }
    }

    await exportDocument(docId, format, { pageLayout });
  };

  return (
    <div>
      <SiteHeader name={doc?.name || "Editor"} breadcrumbs={breadcrumbs}>
        {isReadOnly && (
          <Badge variant="secondary" className="gap-1 text-xs">
            <Eye className="h-3 w-3" />
            View only
          </Badge>
        )}

        {!isReadOnly && (
          <PageLayoutSelector
            value={pageLayout}
            onChange={handleLayoutChange}
          />
        )}

        {!isReadOnly && (
          <ShareDialog
            resourceType="document"
            resourceId={docId!}
            resourceName={doc?.name || "Document"}
            isPrivate={doc?.is_private}
            trigger={
              <Button variant="outline" size="sm">
                <Share2 />
                <span className=" hidden md:inline">Share</span>
              </Button>
            }
          />
        )}

        <ContentLanguageToggle
          value={contentLang}
          onChange={setContentLang}
          loading={contentTranslating}
          compact
        />

        {!isReadOnly && (
          <Button variant="outline" size="sm" onClick={() => setVersionHistoryOpen(true)}>
            <History />
            <span className=" hidden md:inline">History</span>
          </Button>
        )}

        <ExportDialog
          onExport={handleExport}
          title="Export Document"
          description="Choose a format to export your document."
          trigger={
            <Button variant="default" size="sm">
              <Download />
              <span className=" hidden md:inline">Export</span>
            </Button>
          }
        />

        {selectedProjectId && docId && (
          <CommentButton
            count={commentCount}
            onClick={() => setCommentsOpen(true)}
          />
        )}
      </SiteHeader>
      {doc?.source_file_mime && (
        <FileViewer
          docId={docId!}
          mime={doc.source_file_mime}
          fileName={doc.source_file_name}
        />
      )}
      {isLockedByOther && (
        <div className="mx-auto max-w-4xl px-4 pt-4">
          <Alert
            variant="destructive"
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              <AlertDescription>
                {lockStatus?.locked_by_name || "Someone"} is currently editing
                this document.
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
      <div className={doc?.source_file_mime ? 'hidden' : undefined}>
      <OndokiEditor
        docId={docId as string}
        readOnly={isReadOnly}
        headerSlot={(saveStatus, errorMessage) => (
          <>
            {selectedProjectId && docId && (
              <ContextLinkPanel
                projectId={selectedProjectId}
                resourceType="document"
                resourceId={docId}
              />
            )}
            <div className="flex items-center gap-2 text-xs mt-2">
              {folderName && (
                <span className="inline-flex items-center gap-1 rounded bg-muted/60 px-2 py-0.5 text-muted-foreground font-medium">
                  <FolderIcon className="size-3" strokeWidth={1.5} />
                  {folderName}
                </span>
              )}
              {saveStatus === "saving" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-muted-foreground animate-pulse">
                  Saving...
                </span>
              )}
              {saveStatus === "saved" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-green-600 font-medium">
                  ✓ Saved
                </span>
              )}
              {(saveStatus === "error" ||
                saveStatus === "validation-error") && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-red-500 font-medium"
                  title={errorMessage ?? undefined}
                >
                  {errorMessage ?? "Error"}
                </span>
              )}
            </div>
          </>
        )}
      />
      </div>

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

      {docId && (
        <VersionHistoryPanel
          open={versionHistoryOpen}
          onClose={() => setVersionHistoryOpen(false)}
          docId={docId}
          onRestore={() => {
            // Force full page reload so editor re-initializes with restored content
            // (TipTap caches content internally, query invalidation alone isn't enough)
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
