import { Link, useParams } from 'react-router-dom';
import { NotionEditor } from '@/components/tiptap-templates/simple/notion-editor';
import { Button } from '@/components/ui/button';
import { SiteHeader } from '@/components/site-header';
import { IconDownload } from '@tabler/icons-react';
import {
  PageLayoutSelector,
  type PageLayout,
} from '@/components/page-layout-selector';
import { useState, useEffect } from 'react';
import { useDocument, useUpdateDocumentLayout } from '@/hooks/api/documents';
import { exportDocument, type DocumentExportFormat } from '@/api/documents';
import { ExportDialog } from '@/components/export-dialog';
import { useChat } from '@/components/Chat/ChatContext';
import { useProject } from '@/providers/project-provider';

export default function EditorPage() {
  const { docId } = useParams<{ docId: string }>();
  const { data: doc } = useDocument(docId!);
  const { setContext } = useChat();
  const { selectedProjectId } = useProject();

  const [pageLayout, setPageLayout] = useState<PageLayout>('full');
  const updateLayout = useUpdateDocumentLayout(docId!);

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
    setPageLayout(value);
    if (docId) updateLayout.mutate(value);
  };

  const handleExport = async (format: DocumentExportFormat) => {
    if (!docId) return;
    // Pass the current page layout to the export function
    await exportDocument(docId, format, { pageLayout });
  };

  return (
    <div>
      <SiteHeader name="Editor">
        <PageLayoutSelector value={pageLayout} onChange={handleLayoutChange} />
        
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
      </SiteHeader>
      <NotionEditor docId={docId as string} />
    </div>
  );
}
