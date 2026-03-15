import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import * as React from 'react';

interface LongTextSettingsProps {
  name: string;
  onNameChange: (name: string) => void;
  onSubmit: (config: { richText: boolean }) => void;
  onCancel: () => void;
}

export function LongTextSettings({ 
  name, 
  onNameChange, 
  onSubmit,
  onCancel 
}: LongTextSettingsProps) {
  const [richText, setRichText] = React.useState(true);

  return (
    <div className="space-y-4">
      <div>
        <Label>Field Name</Label>
        <Input
          placeholder="Field name (optional)"
          value={name}
          onChange={(e) => onNameChange(e.currentTarget.value)}
          className="mt-1"
        />
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor="rich-text">Enable Rich Text Formatting</Label>
        <Switch
          id="rich-text"
          checked={richText}
          onCheckedChange={setRichText}
        />
      </div>

      <div className="text-xs text-muted-foreground">
        Rich text allows formatting like bold, italic, lists, and more.
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => onSubmit({ richText })}>
          Create Column
        </Button>
      </div>
    </div>
  );
}
