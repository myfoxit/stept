import * as React from 'react';
import { useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EditorContent, EditorContext } from '@tiptap/react';

import '@/components/Editor/styles/blockquote.scss';
import '@/components/Editor/styles/code-block.scss';
import '@/components/Editor/styles/horizontal-rule.scss';
import '@/components/Editor/styles/list.scss';
import '@/components/Editor/styles/image.scss';
import '@/components/Editor/styles/heading.scss';
import '@/components/Editor/styles/paragraph.scss';
import '@/components/Editor/styles/editor.scss';

import { FloatingToolbar } from '@/components/Editor/FloatingToolbar';
import { MobileToolbar } from '@/components/Editor/MobileToolbar';
import { DragMenu } from '@/components/Editor/DragMenu';

import { Button } from '@/components/ui/button';
import { useOndokiEditor } from '@/components/Editor/hooks/useOndokiEditor';
import { useTextContainerDocument } from '@/components/Editor/hooks/useTextContainerDocument';
import { SiteHeader } from '@/components/site-header';

export function TextContainerEditor({
  containerId = '',
}: {
  containerId?: string;
}) {
  const [containerName, setContainerName] = useState('');
  const { isLoading, container, save } = useTextContainerDocument(containerId, containerName);
  const editor = useOndokiEditor({});
  const navigate = useNavigate();

  useEffect(() => {
    if (editor && container) {
      editor.commands.setContent(container.content, false);
    }
  }, [editor, container]);

  useEffect(() => {
    if (!isLoading && container?.name) {
      setContainerName(container.name);
    }
  }, [isLoading, container?.name]);

  const handleSave = useCallback(() => {
    if (!editor) return;
    save(editor.getJSON());
    navigate(-1);
  }, [editor, save, navigate]);

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

      <div className="ondoki-editor-wrapper">
        <input
          type="text"
          className="ondoki-page-title"
          placeholder="Untitled"
          value={containerName}
          onChange={(e) => setContainerName(e.target.value)}
          spellCheck={false}
        />
        <EditorContext.Provider value={{ editor }}>
          <EditorContent editor={editor} role="presentation" className="ondoki-editor-content">
            <DragMenu />
            <FloatingToolbar />
            <MobileToolbar />
          </EditorContent>
        </EditorContext.Provider>
      </div>
    </div>
  );
}
