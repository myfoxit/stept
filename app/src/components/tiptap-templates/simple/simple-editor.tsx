import * as React from 'react';
import { Textarea } from '@/components/ui/textarea';

/**
 * Simplified editor for long text fields.
 * Uses a basic textarea instead of the full tiptap editor.
 */
export function SimpleEditor({
  initialContent,
  onChange,
  placeholder = 'Write...',
  readOnly = false,
}: {
  initialContent?: any;
  onChange?: (content: any) => void;
  placeholder?: string;
  readOnly?: boolean;
}) {
  const extractText = (node: any): string => {
    if (!node) return '';
    if (typeof node === 'string') return node;
    if (node.type === 'text') return node.text || '';
    if (node.content) {
      return node.content.map(extractText).join('\n');
    }
    return '';
  };

  const textValue = React.useMemo(() => {
    if (!initialContent) return '';
    if (typeof initialContent === 'string') return initialContent;
    return extractText(initialContent);
  }, [initialContent]);

  const [value, setValue] = React.useState(textValue);

  React.useEffect(() => {
    setValue(textValue);
  }, [textValue]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    if (onChange) {
      onChange({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: newValue
              ? [{ type: 'text', text: newValue }]
              : [],
          },
        ],
      });
    }
  };

  return (
    <Textarea
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      readOnly={readOnly}
      className="min-h-[300px] resize-y"
    />
  );
}
