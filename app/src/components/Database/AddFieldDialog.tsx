import * as React from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const FIELD_TYPES = [
  { value: 'single_line_text', label: 'Single Line Text' },
  { value: 'long_text', label: 'Long Text' },
  { value: 'number', label: 'Number' },
  { value: 'decimal', label: 'Decimal' },
  { value: 'currency', label: 'Currency' },
  { value: 'percent', label: 'Percent' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'single_select', label: 'Single Select' },
  { value: 'multi_select', label: 'Multi Select' },
  { value: 'date', label: 'Date' },
  { value: 'datetime', label: 'Date & Time' },
  { value: 'email', label: 'Email' },
  { value: 'url', label: 'URL' },
  { value: 'phone', label: 'Phone' },
  { value: 'rating', label: 'Rating' },
];

interface AddFieldDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; field_type: string; options?: Record<string, any> }) => void;
  isPending?: boolean;
}

export function AddFieldDialog({ open, onOpenChange, onSubmit, isPending }: AddFieldDialogProps) {
  const [name, setName] = React.useState('');
  const [fieldType, setFieldType] = React.useState('single_line_text');
  const [choicesText, setChoicesText] = React.useState('');

  const needsChoices = fieldType === 'single_select' || fieldType === 'multi_select';

  const handleSubmit = () => {
    if (!name.trim()) return;
    const options: Record<string, any> = {};
    if (needsChoices && choicesText.trim()) {
      options.choices = choicesText.split(',').map((s) => s.trim()).filter(Boolean);
    }
    onSubmit({
      name: name.trim(),
      field_type: fieldType,
      options: Object.keys(options).length > 0 ? options : undefined,
    });
    setName('');
    setFieldType('single_line_text');
    setChoicesText('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Field</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="field-name">Field Name</Label>
            <Input
              id="field-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Field name"
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            />
          </div>
          <div className="space-y-2">
            <Label>Field Type</Label>
            <Select value={fieldType} onValueChange={setFieldType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((ft) => (
                  <SelectItem key={ft.value} value={ft.value}>{ft.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {needsChoices && (
            <div className="space-y-2">
              <Label htmlFor="field-choices">Choices (comma-separated)</Label>
              <Input
                id="field-choices"
                value={choicesText}
                onChange={(e) => setChoicesText(e.target.value)}
                placeholder="Option 1, Option 2, Option 3"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={!name.trim() || isPending}>
            {isPending ? 'Adding...' : 'Add Field'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
