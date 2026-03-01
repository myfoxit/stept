import * as React from 'react';
import { EditorContent, EditorContext } from '@tiptap/react';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

// Node styles
import '@/components/Editor/styles/blockquote.scss';
import '@/components/Editor/styles/code-block.scss';
import '@/components/Editor/styles/horizontal-rule.scss';
import '@/components/Editor/styles/list.scss';
import '@/components/Editor/styles/image.scss';
import '@/components/Editor/Nodes/ResizableImage/resizable-image.scss';
import '@/components/Editor/styles/heading.scss';
import '@/components/Editor/styles/paragraph.scss';
import '@/components/Editor/styles/editor.scss';

// Editor components
import { FloatingToolbarContent } from '@/components/Editor/FloatingToolbar';
import { MobileToolbar } from '@/components/Editor/MobileToolbar';
import { DragMenu } from '@/components/Editor/DragMenu';

// Hooks
import { useOndokiEditor } from '@/components/Editor/hooks/useOndokiEditor';
import { useAutoSave } from '@/components/Editor/hooks/useAutoSave';


import { PAGE_FORMATS } from '@/components/Editor/Extensions/pagination';


import { useQueryClient } from '@tanstack/react-query';
import { useDocument, useSaveDocument, useAllTextContainer, useTextContainer } from '@/hooks/api/documents';
import { queryKeys } from '@/lib/queryKeys';
import { AICommandPanel, AI_COMMANDS } from '@/components/Editor/Extensions/ai-commands';
import { SpotlightSearch } from '@/components/spotlight/SpotlightSearch';


export function OndokiEditor({ docId, readOnly = false, headerSlot }: {
  docId: string;
  readOnly?: boolean;
  headerSlot?: (saveStatus: string, errorMessage: string | null) => React.ReactNode;
}) {
  const { data: doc, isLoading: docLoading } = useDocument(docId);
  const saveDocument = useSaveDocument(docId);
  const editor = useOndokiEditor({ readOnly });
  const queryClient = useQueryClient();

  const [title, setTitle] = useState<string>('');
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentDocId, setCurrentDocId] = useState<string>(docId);
  const [contentInitialized, setContentInitialized] = useState(false);
  const [docVersion, setDocVersion] = useState<number | undefined>(undefined);
  const [layout, setLayout] = useState<string>(() => {
    return document.documentElement.getAttribute('data-page-layout') || 'document';
  });

  // Reset initialization when docId changes
  useEffect(() => {
    if (docId !== currentDocId) {
      setIsInitialized(false);
      setContentInitialized(false);
      setCurrentDocId(docId);
      setTitle('');
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
            onError: reject,
          },
        );
      });
    },
    [saveDocument, title, isInitialized, layout, docVersion],
  );

  const handleConflict = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.document(docId) });
  }, [queryClient, docId]);

  const reloadDocument = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.document(docId) });
    setContentInitialized(false);
    setIsInitialized(false);
  }, [queryClient, docId]);

  const { saveStatus, errorMessage, hasLocalRecovery, restoreFromLocal, dismissRecovery } =
    useAutoSave(editor, save, 3000, isInitialized ? [title] : [], {
      docId,
      onConflict: handleConflict,
    });

  const { data: containers = [] } = useAllTextContainer();

  // Workflow insert via spotlight
  const [workflowInsertMode, setWorkflowInsertMode] = useState(false);

  // Inline AI writer state
  const [aiCommandCoords, setAiCommandCoords] = useState<{ x: number; y: number } | null>(null);
  const aiWriteCommand = React.useMemo(() => AI_COMMANDS.find((c) => c.command === 'write') ?? null, []);

  // Listen for inline AI write events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.x != null && detail?.y != null) {
        setAiCommandCoords({ x: detail.x, y: detail.y });
      }
    };
    window.addEventListener('ondoki:ai-inline-write', handler);
    return () => window.removeEventListener('ondoki:ai-inline-write', handler);
  }, []);

  // Listen for workflow insert events — opens spotlight in insert mode
  useEffect(() => {
    const handler = () => setWorkflowInsertMode(true);
    window.addEventListener('ondoki:insert-workflow', handler);
    return () => window.removeEventListener('ondoki:insert-workflow', handler);
  }, []);

  // Text container insert
  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null);
  const containerData = useTextContainer(selectedContainerId);

  useEffect(() => {
    if (containerData?.content && editor) {
      editor.chain().focus().insertContent(containerData.content).run();
      setSelectedContainerId(null);
    }
  }, [containerData, editor]);

  // Set document content when ready
  useEffect(() => {
    if (editor && doc && !contentInitialized) {
      editor.commands.setContent(doc!.content, { emitUpdate: false });
      setContentInitialized(true);
    }
  }, [editor, doc, contentInitialized]);

  // Adopt document's stored layout
  useEffect(() => {
    if (doc?.page_layout && doc.page_layout !== layout) {
      setLayout(doc.page_layout);
    }
  }, [doc?.page_layout, layout]);

  // Apply layout and sync with Pages extension
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
      editor.commands.setPaginationEnabled(false);
    }
  }, [editor, layout]);

  // Page CSS vars
  const pageCssVars = React.useMemo(() => {
    if (layout === 'a4') {
      return {
        ['--page-width' as any]: `${PAGE_FORMATS.A4.width}px`,
        ['--page-left-margin' as any]: `${PAGE_FORMATS.A4.margins.left}px`,
      };
    }
    if (layout === 'letter') {
      return {
        ['--page-width' as any]: `${PAGE_FORMATS.Letter.width}px`,
        ['--page-left-margin' as any]: `${PAGE_FORMATS.Letter.margins.left}px`,
      };
    }
    return {};
  }, [layout]);

  // Mobile scaling
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1024,
  );

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const mobileScaleVars = React.useMemo(() => {
    const padding = 32;
    const available = viewportWidth - padding;
    if (layout === 'a4' && viewportWidth < 850) {
      return { ['--page-scale' as any]: Math.max(0.45, available / PAGE_FORMATS.A4.width) };
    }
    if (layout === 'letter' && viewportWidth < 870) {
      return { ['--page-scale' as any]: Math.max(0.45, available / PAGE_FORMATS.Letter.width) };
    }
    return { ['--page-scale' as any]: 1 };
  }, [layout, viewportWidth]);

  const combinedCssVars = React.useMemo(() => ({ ...pageCssVars, ...mobileScaleVars }), [pageCssVars, mobileScaleVars]);

  return (
    <div className={`ondoki-editor-wrapper layout-${layout}`} style={combinedCssVars as React.CSSProperties}>
      {/* Header slot + save status */}
      {headerSlot && (
        <div className="ondoki-page-meta">
          {headerSlot(saveStatus, errorMessage)}
        </div>
      )}

      {/* Conflict banner */}
      {saveStatus === 'conflict' && (
        <div className="mx-4 mb-2 rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-3 flex items-center justify-between text-sm">
          <span className="text-amber-800 dark:text-amber-200">
            This document was modified elsewhere. Reload to get the latest version.
          </span>
          <button onClick={reloadDocument} className="ml-3 px-3 py-1 rounded-md bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 shrink-0">
            Reload
          </button>
        </div>
      )}

      {/* Local recovery banner */}
      {hasLocalRecovery && (
        <div className="mx-4 mb-2 rounded-md bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-3 flex items-center justify-between text-sm">
          <span className="text-blue-800 dark:text-blue-200">Unsaved changes found. Restore?</span>
          <div className="flex gap-2 shrink-0">
            <button onClick={restoreFromLocal} className="px-3 py-1 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700">Restore</button>
            <button onClick={dismissRecovery} className="px-3 py-1 rounded-md bg-transparent border border-primary/30 text-primary text-xs font-medium hover:bg-primary/10">Dismiss</button>
          </div>
        </div>
      )}

      <input
        type="text"
        className="ondoki-page-title"
        placeholder="Untitled"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        spellCheck={false}
      />

      <EditorContext.Provider value={{ editor }}>
        <EditorContent editor={editor} role="presentation" className="ondoki-editor-content">
          <DragMenu />
          {editor && <FloatingToolbarContent editor={editor} />}
          <MobileToolbar />

          {/* Inline AI Writer */}
          {editor && aiCommandCoords && aiWriteCommand && (
            <AICommandPanel
              editor={editor}
              command={aiWriteCommand}
              coords={aiCommandCoords}
              onClose={() => setAiCommandCoords(null)}
            />
          )}
        </EditorContent>

        {/* Workflow Picker */}
        <SpotlightSearch
          open={workflowInsertMode}
          onOpenChange={setWorkflowInsertMode}
          mode="insert-workflow"
          onInsertWorkflow={(workflowId) => {
            if (editor) {
              editor.chain().focus().insertContent({
                type: 'process-recording-node',
                attrs: { sessionId: workflowId },
              }).run();
            }
            setWorkflowInsertMode(false);
          }}
        />
      </EditorContext.Provider>
    </div>
  );
}
