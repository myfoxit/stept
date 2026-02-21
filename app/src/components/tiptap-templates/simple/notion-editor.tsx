import * as React from 'react';
import { EditorContent, EditorContext } from '@tiptap/react';
import '@/components/tiptap-node/blockquote-node/blockquote-node.scss';
import '@/components/tiptap-node/code-block-node/code-block-node.scss';
import '@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node.scss';
import '@/components/tiptap-node/list-node/list-node.scss';
import '@/components/tiptap-node/image-node/image-node.scss';
import '@/components/tiptap-node/heading-node/heading-node.scss';
import '@/components/tiptap-node/paragraph-node/paragraph-node.scss';
import { SlashDropdownMenu } from '@/components/tiptap-ui/slash-dropdown-menu';
import { DragContextMenu } from '@/components/tiptap-ui/drag-context-menu';
import '@/components/tiptap-templates/simple/notion-like-editor.scss';
import { MobileToolbar } from './notion-like-editor-mobile-toolbar';
import { NotionToolbarFloating } from './notion-like-editor-toolbar-floating';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useSnapEditor } from './useSnapEditor';
import { useDocumentAutoSave } from './useDocumentAutoSave';
import type { PageLayout } from '@/components/page-layout-selector';
import { PAGE_FORMATS } from '@/components/tiptap-extensions/pagination';


import { IconInputCheck } from '@tabler/icons-react';
import { listWorkflows } from '@/api/workflows';
import type { ProcessRecordingSession } from '@/types/openapi';
import { useQueryClient } from '@tanstack/react-query';
import { useDocument, useSaveDocument, useAllTextContainer, useTextContainer } from '@/hooks/api/documents';
import { queryKeys } from '@/lib/queryKeys';
import { useChat } from '@/components/Chat/ChatContext';

export interface NotionEditorProps {
  room: string;
  placeholder?: string;
}

export interface EditorProviderProps {
  placeholder?: string;
}

export function NotionEditor({ docId, readOnly = false, headerSlot }: { docId: string; readOnly?: boolean; headerSlot?: (saveStatus: string, errorMessage: string | null) => React.ReactNode }) {
  const { data: doc, isLoading: docLoading } = useDocument(docId);
  const saveDocument = useSaveDocument(docId);
  const editor = useSnapEditor({ readOnly });
  const queryClient = useQueryClient();

  const [title, setTitle] = React.useState<string>('');
  const [isInitialized, setIsInitialized] = React.useState(false);
  const [currentDocId, setCurrentDocId] = React.useState<string>(docId);
  const [contentInitialized, setContentInitialized] = React.useState(false);
  const [docVersion, setDocVersion] = React.useState<number | undefined>(undefined);
  // Keep a stable layout; initialize from current DOM attr to avoid fallback flicker
  const [layout, setLayout] = React.useState<string>(() => {
    return document.documentElement.getAttribute('data-page-layout') || 'document';
  });

  // Reset initialization when docId changes
  useEffect(() => {
    if (docId !== currentDocId) {
      setIsInitialized(false);
      setContentInitialized(false);
      setCurrentDocId(docId);
      setTitle(''); // Clear title immediately to prevent cross-contamination
    }
  }, [docId, currentDocId]);

  // Update title and init when document load finishes
  useEffect(() => {
    if (!isInitialized && !docLoading && doc) {
      setTitle(doc.name ?? '');
      setDocVersion((doc as any).version);
      setIsInitialized(true);
    }
  }, [isInitialized, docLoading, doc]);

  const save = useCallback(
    (content: unknown): Promise<any> => {
      if (!isInitialized) return Promise.resolve();
      return new Promise((resolve, reject) => {
        saveDocument.mutate(
          { name: title, content, page_layout: layout || 'document', version: docVersion },
          {
            onSuccess: (data: any) => {
              if (data?.version) setDocVersion(data.version);
              resolve(data);
            },
            onError: (err: any) => {
              reject(err);
            },
          }
        );
      });
    },
    [saveDocument, title, isInitialized, layout, docVersion]
  );

  const handleConflict = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.document(docId) });
  }, [queryClient, docId]);

  const reloadDocument = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.document(docId) });
    setContentInitialized(false);
    setIsInitialized(false);
  }, [queryClient, docId]);

  // Pass title as dependency
  const { saveStatus, errorMessage, hasLocalRecovery, restoreFromLocal, dismissRecovery } =
    useDocumentAutoSave(editor, save, 3000, isInitialized ? [title] : [], {
      docId,
      onConflict: handleConflict,
    });

  const { data: containers = [] } = useAllTextContainer();
  const { openPanel: openChatPanel } = useChat();

  // Workflow picker state
  const [showWorkflowPicker, setShowWorkflowPicker] = React.useState(false);
  const [availableWorkflows, setAvailableWorkflows] = React.useState<ProcessRecordingSession[]>([]);

  // Listen for AI command events from slash menu — open chat panel
  useEffect(() => {
    const handler = () => openChatPanel();
    window.addEventListener('ondoki:open-chat-panel', handler);
    return () => window.removeEventListener('ondoki:open-chat-panel', handler);
  }, [openChatPanel]);

  // Listen for workflow insert events from slash menu
  useEffect(() => {
    const handler = async () => {
      try {
        const workflows = await listWorkflows(50, 0);
        setAvailableWorkflows(workflows);
        setShowWorkflowPicker(true);
      } catch (err) {
        console.error('Failed to fetch workflows:', err);
      }
    };
    window.addEventListener('ondoki:insert-workflow', handler);
    return () => window.removeEventListener('ondoki:insert-workflow', handler);
  }, [editor]);

  const [selectedId, setId] = React.useState<string | null>(null);
  const containerData = useTextContainer(selectedId);

  React.useEffect(() => {
    if (containerData?.content && editor) {
      editor.chain().focus().insertContent(containerData.content).run();
      setId(null);
      console.log('Inserted content from container:', containerData.content);
    }
  }, [containerData, editor]);

  const containerSlashItems = React.useMemo(
    () =>
      containers.map((c) => ({
        title: c.name,
        subtext: 'Insert saved text container',
        aliases: [c.name.toLowerCase(), ...c.name.toLowerCase().split(' ')],
        badge: IconInputCheck,
        group: 'Text Containers',
        onSelect: () => setId(c.id),
      })),
    [containers]
  );

  const slashMenuConfig = React.useMemo(
    () => ({
      customItems: containerSlashItems,
      showGroups: true,
    }),
    [containerSlashItems]
  );

  /* set the document content only when everything is ready */
  useEffect(() => {
    if (editor && doc && !contentInitialized) {
      editor.commands.setContent(doc!.content, false);
      setContentInitialized(true);
    }
  }, [editor, doc, contentInitialized]);

  // Adopt document's stored layout once available, otherwise keep current (prevents flash)
  useEffect(() => {
    if (doc?.page_layout && doc.page_layout !== layout) {
      setLayout(doc.page_layout);
    }
  }, [doc?.page_layout, layout]);

  // Apply layout before paint to avoid flash; sync with Pages extension
  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-page-layout', layout);

    if (!editor) return;

    if (layout === 'a4') {
      editor.commands.setPaginationEnabled(true);
      editor.commands.setPageFormat('A4');
    } else if (layout === 'letter') {
      editor.commands.setPaginationEnabled(true);
      editor.commands.setPageFormat('Letter');
    } else {
      // full or document → no pagination
      editor.commands.setPaginationEnabled(false);
    }
  }, [editor, layout]);

  // Compute CSS vars for title alignment in paginated modes
  const pageCssVars = React.useMemo(() => {
    if (layout === 'a4') {
      return {
        ['--page-width' as any]: `${PAGE_FORMATS.A4.width}px`,
        ['--page-left-margin' as any]: `${PAGE_FORMATS.A4.margins.left}px`,
        ['--page-a4-width-px' as any]: `${PAGE_FORMATS.A4.width}px`,
      };
    }
    if (layout === 'letter') {
      return {
        ['--page-width' as any]: `${PAGE_FORMATS.Letter.width}px`,
        ['--page-left-margin' as any]: `${PAGE_FORMATS.Letter.margins.left}px`,
        ['--page-letter-width-px' as any]: `${PAGE_FORMATS.Letter.width}px`,
      };
    }
    return {};
  }, [layout]);

  // Track viewport width for mobile scaling
  const [viewportWidth, setViewportWidth] = React.useState(() => 
    typeof window !== 'undefined' ? window.innerWidth : 1024
  );

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Calculate scale for mobile
  const mobileScaleVars = React.useMemo(() => {
    const padding = 32; // 16px on each side
    const availableWidth = viewportWidth - padding;
    
    if (layout === 'a4' && viewportWidth < 850) {
      const scale = Math.max(0.45, availableWidth / PAGE_FORMATS.A4.width);
      return { ['--page-scale' as any]: scale };
    }
    if (layout === 'letter' && viewportWidth < 870) {
      const scale = Math.max(0.45, availableWidth / PAGE_FORMATS.Letter.width);
      return { ['--page-scale' as any]: scale };
    }
    return { ['--page-scale' as any]: 1 };
  }, [layout, viewportWidth]);

  const combinedCssVars = React.useMemo(() => ({
    ...pageCssVars,
    ...mobileScaleVars,
  }), [pageCssVars, mobileScaleVars]);

  return (
    <div 
      className={`notion-like-editor-wrapper layout-${layout}`} 
      style={combinedCssVars as React.CSSProperties}
    >
      {/* Header slot + save status */}
      {headerSlot && (
        <div className="notion-page-meta">
          {headerSlot(saveStatus, errorMessage)}
        </div>
      )}

      {/* Conflict banner */}
      {saveStatus === 'conflict' && (
        <div className="mx-4 mb-2 rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-3 flex items-center justify-between text-sm">
          <span className="text-amber-800 dark:text-amber-200">
            This document was modified elsewhere. Reload to get the latest version.
          </span>
          <button
            onClick={reloadDocument}
            className="ml-3 px-3 py-1 rounded-md bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 shrink-0"
          >
            Reload
          </button>
        </div>
      )}

      {/* Local recovery banner */}
      {hasLocalRecovery && (
        <div className="mx-4 mb-2 rounded-md bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-3 flex items-center justify-between text-sm">
          <span className="text-blue-800 dark:text-blue-200">
            Unsaved changes found. Restore?
          </span>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={restoreFromLocal}
              className="px-3 py-1 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
            >
              Restore
            </button>
            <button
              onClick={dismissRecovery}
              className="px-3 py-1 rounded-md bg-transparent border border-primary/30 dark:border-primary/40 text-primary dark:text-primary text-xs font-medium hover:bg-primary/10 dark:hover:bg-primary/20"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <input
        type="text"
        className="notion-page-title"
        placeholder="Untitled"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        spellCheck={false}
      />
      <EditorContext.Provider value={{ editor }}>
        <EditorContent
          editor={editor}
          role="presentation"
          className="notion-like-editor-content"
        >
          <DragContextMenu />
          

          <SlashDropdownMenu config={slashMenuConfig} />
          <NotionToolbarFloating />
        </EditorContent>

        {/* Workflow Picker Modal */}
        {showWorkflowPicker && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowWorkflowPicker(false)}>
            <div className="bg-background rounded-lg shadow-xl p-4 w-96 max-h-96 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-sm font-semibold mb-3">Insert Workflow</h3>
              {availableWorkflows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No workflows found.</p>
              ) : (
                <ul className="space-y-1">
                  {availableWorkflows.map((wf) => (
                    <li key={wf.session_id}>
                      <button
                        className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-accent"
                        onClick={() => {
                          if (editor) {
                            editor.chain().focus().insertContent({
                              type: 'process-recording-node',
                              attrs: { sessionId: wf.session_id },
                            }).run();
                          }
                          setShowWorkflowPicker(false);
                        }}
                      >
                        {wf.title || wf.name || 'Untitled Workflow'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </EditorContext.Provider>
    </div>
  );
}
