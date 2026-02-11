import * as React from 'react';
import { useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { MobileToolbar } from '@/components/tiptap-templates/simple/notion-like-editor-mobile-toolbar';
import { NotionToolbarFloating } from '@/components/tiptap-templates/simple/notion-like-editor-toolbar-floating';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSnapEditor } from '@/components/tiptap-templates/simple/useSnapEditor';

import { useTextContainerDocument } from './useTextContainerDocument';
import { SiteHeader } from '@/components/site-header';

export function TextContainerEditor({
  containerId = '',
}: {
  containerId?: string;
}) {
  const [containerName, setContainerName] = useState('');
  const { isLoading, container, save } = useTextContainerDocument(
    containerId,
    containerName
  );
  const editor = useSnapEditor({});
  const navigate = useNavigate();
  const [title, setTitle] = React.useState<string>(
    () => container?.title ?? ''
  );

  // new: track container name

  // Inject containerId into editor variable data so variables can reference it
  useEffect(() => {
    if (!isLoading && editor) {
      editor.commands.setVariableData({ containerId });
    }
  }, [isLoading, containerId, editor]);

  // When we get the document, load it into the editor (disable history merge)
  useEffect(() => {
    if (editor && container) {
      editor.commands.setContent(container.content, false);
    }
  }, [editor, container]);

  // new: set initial name once container is loaded
  useEffect(() => {
    if (!isLoading && container?.name) {
      setContainerName(container.name);
    }
  }, [isLoading, container?.name]);

  // --------------------------------------------------------------------------
  // Manual save – persist and go back
  // --------------------------------------------------------------------------
  const handleSave = useCallback(() => {
    if (!editor) return;
    // now save both name and content
    save(editor.getJSON());
    navigate(-1); // go back to the previous page (EditorPage)
  }, [editor, save, navigate, containerName]);

  return (
    <div>
      <SiteHeader name="Add Text Container">
        <Button size="sm" variant="outline" onClick={() => navigate(-1)}>
          Close
        </Button>
        <Button size="sm" onClick={handleSave}>
          Save
        </Button>
      </SiteHeader>

      <div className="notion-like-editor-wrapper">
        <input
          type="text"
          className="notion-page-title"
          placeholder="Untitled"
          value={containerName}
          onChange={(e) => setContainerName(e.target.value)}
          spellCheck={false}
        />
        <EditorContext.Provider value={{ editor }}>
          <EditorContent
            editor={editor}
            role="presentation"
            className="notion-like-editor-content"
          >
            <DragContextMenu />
            <MobileToolbar />
            <SlashDropdownMenu />
            <NotionToolbarFloating />
          </EditorContent>
        </EditorContext.Provider>
      </div>
    </div>
  );
}
