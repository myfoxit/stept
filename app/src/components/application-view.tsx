import * as React from 'react';
import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { NotionEditor } from '@/components/tiptap-templates/simple/notion-editor';
import { ApplicationNavBar } from './application-nav-bar';
import { Button } from '@/components/ui/button';

import { IconEdit, IconEye, IconSettings } from '@tabler/icons-react';
import { cn } from '@/lib/utils';
import { useDocument, useSaveDocument, useCreateDocument, useDeleteDocument } from '@/hooks/api/documents';

interface ApplicationViewProps {
  docId: string;
  pageId?: string;  // NEW: Accept pageId prop
}

export function ApplicationView({ docId, pageId }: ApplicationViewProps) {
  const [mode, setMode] = useState<'preview' | 'edit'>('preview');
  const [selectedPageId, setSelectedPageId] = useState<string | null>(pageId || null);
  const navigate = useNavigate();
  
  // Get application document
  const { data: appDoc, isLoading: appLoading } = useDocument(docId);
  const saveApp = useSaveDocument(docId);
  const updateDocType = useUpdateDocumentType(docId);
  
  // Get ALL documents in the tree (not filtered)
  const { data: allDocs = [], isLoading: pagesLoading, refetch: refetchTree } = useDocumentTree(
    appDoc?.project_id || null
  );
  
  // Build hierarchical structure from flat list
  const buildPageTree = React.useMemo(() => {
    const findChildren = (parentId: string): any[] => {
      return allDocs
        .filter(doc => doc.parent_id === parentId)
        .sort((a, b) => a.position - b.position)
        .map(doc => ({
          ...doc,
          children: findChildren(doc.id)
        }));
    };
    
    return findChildren(docId);
  }, [allDocs, docId]);
  
  // Create/delete page mutations
  const createPage = useCreateDocument();
  const deletePage = useDeleteDocument();
  
  // Set selected page from URL or first available
  useEffect(() => {
    if (pageId && pageId !== selectedPageId) {
      setSelectedPageId(pageId);
    } else if (!selectedPageId && buildPageTree.length > 0) {
      // Auto-select first page
      const firstPage = buildPageTree[0];
      setSelectedPageId(firstPage.id);
      navigate(`/editor/${docId}/${firstPage.id}`, { replace: true });
    }
  }, [pageId, buildPageTree, selectedPageId, docId, navigate]);
  
  // Handle navigation - update URL
  const handlePageSelect = (pageId: string) => {
    setSelectedPageId(pageId);
    navigate(`/editor/${docId}/${pageId}`);
  };
  
  // Handle app config updates
  const handleAppConfigUpdate = async (updates: Partial<any>) => {
    const currentConfig = appDoc?.app_config || {};
    await saveApp.mutateAsync({
      app_config: { ...currentConfig, ...updates }
    });
  };
  
  // Handle creating new page - ensure it's app_page type
  const handleCreatePage = async (title: string, parentId?: string) => {
    const newPage = await createPage.mutateAsync({
      title,
      projectId: appDoc?.project_id!,
      parentId: parentId || docId,
      docType: 'app_page',  // NEW: Explicitly set as app_page
    });
    
    // Refetch tree to get updated structure
    await refetchTree();
    
    // Select the new page
    handlePageSelect(newPage.id);
    return newPage;
  };
  
  // Handle deleting page
  const handleDeletePage = async (pageId: string) => {
    // Find all descendants to delete
    const findDescendants = (id: string): string[] => {
      const children = allDocs.filter(d => d.parent_id === id);
      return [id, ...children.flatMap(c => findDescendants(c.id))];
    };
    
    const toDelete = findDescendants(pageId);
    
    await deletePage.mutateAsync({
      docId: pageId,
      projectId: appDoc?.project_id!,
    });
    
    // Refetch tree
    await refetchTree();
    
    // Select another page if current was deleted
    if (toDelete.includes(selectedPageId!)) {
      const remaining = buildPageTree.filter(p => !toDelete.includes(p.id));
      if (remaining.length > 0) {
        handlePageSelect(remaining[0].id);
      } else {
        setSelectedPageId(null);
      }
    }
  };
  
  // Handle renaming page
  const handleRenamePage = async (pageId: string, newName: string) => {
    const savePageName = useSaveDocument(pageId);
    await savePageName.mutateAsync({ name: newName });
    await refetchTree();
  };
  
  if (appLoading || pagesLoading) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }
  
  return (
    <div className="h-screen flex flex-col">
      {/* Mode Toggle */}
      <div className="border-b px-4 py-2 flex justify-between items-center bg-background">
        <div className="flex items-center gap-2">
          <IconSettings className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Application Mode</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={mode === 'preview' ? 'default' : 'outline'}
            onClick={() => setMode('preview')}
          >
            <IconEye className="size-4 mr-1" />
            Preview
          </Button>
          <Button
            size="sm"
            variant={mode === 'edit' ? 'default' : 'outline'}
            onClick={() => setMode('edit')}
          >
            <IconEdit className="size-4 mr-1" />
            Edit
          </Button>
        </div>
      </div>
      
      {/* Application Navigation Bar */}
      <ApplicationNavBar
        appName={appDoc?.name || 'Untitled App'}
        logoUrl={appDoc?.app_config?.logo_url}
        pages={buildPageTree}  // Pass hierarchical structure
        selectedPageId={selectedPageId}
        mode={mode}
        onPageSelect={handlePageSelect}
        onAppNameChange={(name) => saveApp.mutate({ name })}
        onLogoChange={(url) => handleAppConfigUpdate({ logo_url: url })}
        onCreatePage={handleCreatePage}
        onDeletePage={handleDeletePage}
        onRenamePage={handleRenamePage}
      />
      
      {/* Page Content */}
      <div className="flex-1 overflow-auto bg-background">
        {selectedPageId ? (
          <div className={cn(
            "h-full",
            mode === 'preview' && "pointer-events-none select-none"
          )}>
            <NotionEditor docId={selectedPageId} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            {buildPageTree.length === 0 ? (
              <>
                <p className="text-lg mb-4">No pages yet</p>
                {mode === 'edit' && (
                  <Button onClick={() => handleCreatePage('New Page')}>
                    Create First Page
                  </Button>
                )}
              </>
            ) : (
              <p className="text-lg">Select a page to view</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
