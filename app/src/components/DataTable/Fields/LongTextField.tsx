import * as React from 'react';
import { IconEdit, IconFileText } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SimpleEditor } from '@/components/tiptap-templates/simple/simple-editor';
import { useUpdateRow } from '@/hooks/api/fields';

interface LongTextFieldProps {
  value: any;
  rowId: number;
  columnId: string;
  tableId: string;
  readonly?: boolean;
}

export function LongTextField({ 
  value, 
  rowId, 
  columnId, 
  tableId,
  readonly = false 
}: LongTextFieldProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [localContent, setLocalContent] = React.useState<any>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const updateRow = useUpdateRow();

  // Parse the value - could be JSON string or object
  const content = React.useMemo(() => {
    if (!value) return null;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        // If not JSON, treat as plain text
        return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }] };
      }
    }
    return value;
  }, [value]);

  // Initialize local content when dialog opens
  React.useEffect(() => {
    if (isOpen) {
      setLocalContent(content);
    }
  }, [isOpen, content]);

  // Extract plain text preview from content
  const getPreview = () => {
    if (!content) return 'Click to edit...';
    
    try {
      // Extract text from ProseMirror JSON
      const extractText = (node: any): string => {
        if (node.type === 'text') return node.text || '';
        if (node.content) {
          return node.content.map(extractText).join(' ');
        }
        return '';
      };
      
      const text = extractText(content).trim();
      if (!text) return 'Click to edit...';
      
      // Truncate for preview
      return text.length > 100 ? text.substring(0, 100) + '...' : text;
    } catch {
      return 'Click to edit...';
    }
  };

  const handleSave = async () => {
    if (!localContent || isSaving) return;
    
    setIsSaving(true);
    try {
      // The backend will handle JSON serialization for long_text columns
      // so we can send the object directly
      await updateRow.mutateAsync({
        tableId,
        rowId,
        data: { [columnId]: localContent }
      });
      
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to save:', error);
      // Optionally show a toast or error message to the user
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    // Reset to original content
    setLocalContent(content);
    setIsOpen(false);
  };

  const handleContentChange = (newContent: any) => {
    setLocalContent(newContent);
  };

  return (
    <>
      <button
        onClick={() => !readonly && setIsOpen(true)}
        className="w-full text-left px-2  hover:bg-muted/50 rounded flex items-center gap-2"
        disabled={readonly}
      >
        <IconFileText size={14} className="text-muted-foreground shrink-0" />
        <span className="text-sm truncate flex-1">
          {getPreview()}
        </span>
        {!readonly && (
          <IconEdit 
            size={14} 
            className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" 
          />
        )}
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent 
          className="max-w-4xl h-[80vh] flex flex-col"
          onKeyDown={(e) => {
            // Stop all keyboard events from propagating to parent components
            e.stopPropagation();
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit Text</DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-auto">
            <SimpleEditor
              initialContent={localContent}
              onChange={handleContentChange}
              placeholder="Start typing..."
              readOnly={readonly}
            />
          </div>
          
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
