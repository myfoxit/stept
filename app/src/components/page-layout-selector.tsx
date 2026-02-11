import * as React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { IconFileText, IconRectangle, IconFile } from '@tabler/icons-react';

export type PageLayout = 'full' | 'document' | 'a4' | 'letter';

interface PageLayoutSelectorProps {
  value: PageLayout;
  onChange: (value: PageLayout) => void;
}

const layoutOptions = [
  { value: 'full', label: 'Full Width', icon: IconRectangle },
  { value: 'document', label: 'Document', icon: IconFileText },
  { value: 'a4', label: 'A4 Paper', icon: IconFile },
  { value: 'letter', label: 'US Letter', icon: IconFile },
] as const;

export function PageLayoutSelector({
  value,
  onChange,
}: PageLayoutSelectorProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[160px] h-8">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {layoutOptions.map((option) => {
          const Icon = option.icon;
          return (
            <SelectItem key={option.value} value={option.value}>
              <div className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5" />
                <span>{option.label}</span>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
