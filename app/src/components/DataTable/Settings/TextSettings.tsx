import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconPlus } from "@tabler/icons-react";

export function TextSettings({ name, onNameChange, onSubmit }: any) {
  return (
    <div className="space-y-4">
      <Input
        placeholder="Field name ( Optional )"
        value={name}
        onChange={(e) => onNameChange(e.currentTarget.value)}
      />
      <Button variant="ghost" size="sm" className="w-full justify-start">
        <IconPlus className="h-4 w-4 mr-2" />
        Set default value
      </Button>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onSubmit}>
          Cancel
        </Button>
        <Button onClick={onSubmit}>Save</Button>
      </div>
    </div>
  );
}
