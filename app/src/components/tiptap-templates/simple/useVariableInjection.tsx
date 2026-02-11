import type { Editor } from '@tiptap/core';
import { useEffect } from 'react';

export function useVariableInjection(
  editor: Editor | null,
  { cols, rows, rowId }
) {
  useEffect(() => {
    if (!editor) return;
    editor.commands.setVariableData({ cols, rows, rowId });
  }, [editor, cols, rows, rowId]);
}
