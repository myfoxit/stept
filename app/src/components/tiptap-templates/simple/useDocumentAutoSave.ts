import { Editor } from '@tiptap/core';
import { useEffect, useRef } from 'react';

export function useDocumentAutoSave(
  editor: Editor | null,
  onSave: (json: unknown) => void,
  delay = 1000,
  dependencies: any[] = []
) {
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const lastSavedContentRef = useRef<string>(''); // NEW: Track last saved content

  // Register editor listeners once
  useEffect(() => {
    if (!editor) return;

    const handleChange = () => {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        // Store current selection before save
        const { from, to } = editor.state.selection;
        const currentContent = JSON.stringify(editor.getJSON());

        // Only save if content actually changed
        if (currentContent !== lastSavedContentRef.current) {
          lastSavedContentRef.current = currentContent;
          onSaveRef.current(editor.getJSON());

          // Ensure cursor position is maintained after save
          // This prevents any async state updates from moving the cursor
          requestAnimationFrame(() => {
            if (editor && !editor.isDestroyed) {
              editor.commands.setTextSelection({ from, to });
            }
          });
        }
      }, delay);
    };

    editor.on('update', handleChange);

    // Initial save
    lastSavedContentRef.current = JSON.stringify(editor.getJSON());
    handleChange();

    return () => {
      clearTimeout(timeoutRef.current);
      editor.off('update', handleChange);
    };
  }, [editor, delay]);

  // Save immediately when external dependencies change (e.g., title)
  useEffect(() => {
    if (!editor || dependencies.length === 0) return; // Don't save on mount with empty deps

    // Store current selection before save
    const { from, to } = editor.state.selection;
    const currentContent = JSON.stringify(editor.getJSON());

    // Only save if content is different or deps changed
    if (currentContent !== lastSavedContentRef.current || dependencies.length > 0) {
      lastSavedContentRef.current = currentContent;
      onSaveRef.current(editor.getJSON());

      // Restore cursor position
      requestAnimationFrame(() => {
        if (editor && !editor.isDestroyed) {
          editor.commands.setTextSelection({ from, to });
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);
}
