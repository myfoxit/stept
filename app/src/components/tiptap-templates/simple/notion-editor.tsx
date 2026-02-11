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
import { useCallback, useEffect, useLayoutEffect } from 'react';
import { useSnapEditor } from './useSnapEditor';
import { useDocumentAutoSave } from './useDocumentAutoSave';
import type { PageLayout } from '@/components/page-layout-selector';
import { PAGE_FORMATS } from '@/components/tiptap-extensions/pagination'; // + import formats for CSS vars


import { IconInputCheck } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useColumns } from '@/hooks/api/columns';
import { useDocument, useSaveDocument, useAllTextContainer, useTextContainer } from '@/hooks/api/documents';
import { useRows } from '@/hooks/api/fields';

export interface NotionEditorProps {
  room: string;
  placeholder?: string;
}

export interface EditorProviderProps {
  placeholder?: string;
}

export function NotionEditor({ docId }: { docId: string }) {
  const { data: doc, isLoading: docLoading } = useDocument(docId);
  const saveDocument = useSaveDocument(docId);
  const editor = useSnapEditor({});
  const queryClient = useQueryClient();

  const [title, setTitle] = React.useState<string>('');
  const [isInitialized, setIsInitialized] = React.useState(false);
  const [currentDocId, setCurrentDocId] = React.useState<string>(docId);
  const [contentInitialized, setContentInitialized] = React.useState(false); // NEW: Track content initialization
  // Keep a stable layout; initialize from current DOM attr to avoid fallback flicker
  const [layout, setLayout] = React.useState<string>(() => {
    return document.documentElement.getAttribute('data-page-layout') || 'document';
  });

  // Reset initialization when docId changes
  useEffect(() => {
    if (docId !== currentDocId) {
      setIsInitialized(false);
      setContentInitialized(false); // NEW: Reset content initialization flag
      setCurrentDocId(docId);
      setTitle(''); // Clear title immediately to prevent cross-contamination
    }
  }, [docId, currentDocId]);

  // Update title and init when document load finishes
  useEffect(() => {
    if (!isInitialized && !docLoading && doc) {
      setTitle(doc.name ?? '');
      setIsInitialized(true);
    }
  }, [isInitialized, docLoading, doc]);

  const save = useCallback(
    (content: unknown) => {
      if (!isInitialized) return;
      // use stable layout state to avoid racing with DOM attribute
      saveDocument.mutate(
        { name: title, content, page_layout: layout || 'document' },
        {
          onSuccess: () => {
            // Invalidate documents query to refresh the navbar with latest title from DB
            queryClient.invalidateQueries({ queryKey: ['documents'] });
          },
        }
      );
    },
    [saveDocument, title, queryClient, isInitialized, layout]
  );

  // Pass title as dependency
  useDocumentAutoSave(editor, save, 1000, isInitialized ? [title] : []);

  const { data: containers = [] } = useAllTextContainer();
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

  // NEW ───────────────────────────────────────────────────────────
  const linkedTableId = doc?.linked_table_id ?? '';
  const linkedRowId = doc?.linked_row_id ?? null;

  const { data: cols = [], isLoading: colsLoading } = useColumns(linkedTableId);

  const { data: rowsData, isLoading: rowsLoading } = useRows(linkedTableId);
  
  // Handle both paginated response and single row response
  const rows = React.useMemo(() => {
    if (!rowsData) return [];
    // If it's a paginated response with items array
    if (rowsData?.items) return rowsData.items;
    // If it's an array directly
    if (Array.isArray(rowsData)) return rowsData;
    // If it's a single row object
    if (rowsData?.id) return [rowsData];
    return [];
  }, [rowsData]);
  // ───────────────────────────────────────────────────────────

  /* inject variable store only when the data are ready */
  useEffect(() => {
    const ready = editor && linkedTableId ? !colsLoading && !rowsLoading : true; // no table → always ready

    if (ready && editor) {
      (editor as any).storage.variableStore = {
        cols,
        rows: rowsData,  // Pass the original data structure
        tableId: linkedTableId,
        rowId: linkedRowId,
        tableName: '',
      };
      // notify node-views
      (editor as any).emit?.('variableStoreUpdate');
    }
  }, [
    editor,
    cols,
    rowsData,  // Changed from rows to rowsData
    colsLoading,
    rowsLoading,
    linkedTableId,
    linkedRowId,
  ]);

  /* set the document content only when everything is ready */
  useEffect(() => {
    const ready = doc && (!linkedTableId || (!colsLoading && !rowsLoading));
    if (editor && ready && !contentInitialized) {  // NEW: Check contentInitialized flag
      // Only set content if this is the first time loading this document
      editor.commands.setContent(doc!.content, false);
      setContentInitialized(true); // NEW: Mark content as initialized
    }
  }, [editor, doc, colsLoading, rowsLoading, linkedTableId, contentInitialized]); // NEW: Add contentInitialized to deps

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
    // no extra vars for 'full' or 'document'
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
      </EditorContext.Provider>
    </div>
  );
}
