import { ThemeToggle } from '@/components/tiptap-templates/simple/notion-like-editor-theme-toggle';

// --- Tiptap UI ---
import { UndoRedoButton } from '@/components/tiptap-ui/undo-redo-button';

// --- UI Primitives ---
import { Spacer } from '@/components/tiptap-ui-primitive/spacer';
import { Separator } from '@/components/tiptap-ui-primitive/separator';
import { ButtonGroup } from '@/components/tiptap-ui-primitive/button';

// --- Styles ---
import '@/components/tiptap-templates/simple/notion-like-editor-header.scss';

export function NotionEditorHeader() {
  return (
    <header className="notion-like-editor-header">
      <Spacer />
      <div className="notion-like-editor-header-actions">
        <ButtonGroup orientation="horizontal">
          <UndoRedoButton action="undo" />
          <UndoRedoButton action="redo" />
        </ButtonGroup>

       
      </div>
    </header>
  );
}
