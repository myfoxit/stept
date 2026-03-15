import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function NumberSettings({ name, onNameChange, onSubmit }: any) {
  return (
    <div className="space-y-2">
      <Input
        placeholder="Field name"
        value={name}
        onChange={(e) => onNameChange(e.currentTarget.value)}
      />
      <Input placeholder="Min value (optional)" type="number" />
      <Input placeholder="Max value (optional)" type="number" />
      <Button onClick={onSubmit}>Save</Button>
    </div>
  );
}
