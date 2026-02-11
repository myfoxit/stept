
import { useProject } from '@/providers/project-provider';
import { useState } from 'react';
import { Input } from '@/components/ui/input.tsx';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.tsx';
import { Switch } from '@/components/ui/switch.tsx';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion.tsx';
import { Button } from '@/components/ui/button.tsx';
import { useTables } from '@/hooks/api/tables';

interface RelationSettingsProps {
  name: string;
  onNameChange: (v: string) => void;
  onSubmit: (opts: {
    relation_type: string;
    related_table_id: string;
    limit_view: boolean;
    limit_filters: boolean;
  }) => void;
  onCancel: () => void;
}

export function RelationSettings({
  name,
  onNameChange,
  onSubmit,
  onCancel,
}: RelationSettingsProps) {
  const { selectedProjectId } = useProject();
  const { data: tables = [] } = useTables(selectedProjectId || undefined);
  const [relationType, setRelationType] = useState('many_to_many');
  const [relatedTableId, setRelatedTableId] = useState<string | undefined>();
  const [limitView, setLimitView] = useState(false);
  const [limitFilters, setLimitFilters] = useState(false);
  const [description, setDescription] = useState('');

  function handleSave() {
    if (!relatedTableId) return;
    onSubmit({
      relation_type: relationType,
      related_table_id: relatedTableId,
      limit_view: limitView,
      limit_filters: limitFilters,
    });
  }

  return (
    <div className="space-y-4 max-h-[800px]:max-h-78 overflow-y-auto pr-1">
      {/* Field name */}
      <Input
        placeholder="Field name (optional)"
        value={name}
        onChange={(e) => onNameChange(e.currentTarget.value)}
      />

      {/* Relation type */}
      <div>
        <span className="block text-xs font-medium mb-1">Relation type</span>
        <ToggleGroup
          type="single"
          className="grid grid-cols-3 gap-1 rounded-md border"
          value={relationType}
          onValueChange={(v) => v && setRelationType(v)}
        >
          <ToggleGroupItem value="many_to_many">Many To Many</ToggleGroupItem>
          <ToggleGroupItem value="one_to_many">Has Many</ToggleGroupItem>
          <ToggleGroupItem value="one_to_one">One to One</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Table select */}
      <div className="space-y-1 w-full">
        <span className="block text-xs font-medium mb-1">
          Select table to link
        </span>
        <Select
          value={relatedTableId}
          onValueChange={(val) => setRelatedTableId(val)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select table" />
          </SelectTrigger>
          <SelectContent>
            {tables.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

    

      {/* Advanced & description */}
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="advanced">
          <AccordionTrigger className="text-sm">
            Advanced settings
          </AccordionTrigger>
          <AccordionContent>
            <p className="text-sm text-muted-foreground">
              Advanced options will appear here.
            </p>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="description">
          <AccordionTrigger className="text-sm">
            Add description
          </AccordionTrigger>
          <AccordionContent>
            <Input
              placeholder="Add description…"
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave}>Save</Button>
      </div>
    </div>
  );
}
