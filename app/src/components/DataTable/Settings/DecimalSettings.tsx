import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { IconPlus, IconX } from '@tabler/icons-react';

export interface DecimalSettingsProps {
  name: string;
  precision?: string;                      // ← make optional
  showThousandsSeparator?: boolean;        // ← make optional
  defaultValue?: string;
  onNameChange: (value: string) => void;
  onPrecisionChange?: (value: string) => void;  // ← make optional
  onToggleThousands?: (checked: boolean) => void; // ← make optional
  onDefaultValueChange?: (value: string | undefined) => void;
  onSubmit: (cfg: {
    scale: number;
    default_value?: number;
    settings?: Record<string, any>;
  }) => void;
  onCancel?: () => void;
}

// Reusable control for toggling and editing a default value (exported for reuse)
export function DefaultValueControl(props: {
  label?: string;
  enabled: boolean;
  value?: string;
  inputType?: string;
  inputStep?: string;
  placeholder?: string;
  onToggle: (enabled: boolean) => void;
  onChange: (value: string | undefined) => void;
  defaultWhenEnable?: string;
}) {
  const {
    label = 'Default value',
    enabled,
    value,
    inputType = 'text',
    inputStep,
    placeholder,
    onToggle,
    onChange,
    defaultWhenEnable = '',
  } = props;

  return !enabled ? (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start"
      onClick={() => {
        onToggle(true);
        onChange(defaultWhenEnable || undefined);
      }}
    >
      <IconPlus className="h-4 w-4 mr-2" />
      Set default value
    </Button>
  ) : (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            onToggle(false);
            onChange(undefined);
          }}
          className="h-auto p-1"
        >
          <IconX className="h-4 w-4" />
        </Button>
      </div>
      <Input
        type={inputType}
        placeholder={placeholder ?? 'Enter default value'}
        value={value ?? ''}
        onChange={(e) => onChange(e.currentTarget.value || undefined)}
        step={inputStep}
      />
    </div>
  );
}

export function DecimalSettings({
  name,
  precision = '2',                       // ← default
  showThousandsSeparator = false,        // ← default
  defaultValue,
  onNameChange,
  onPrecisionChange,
  onToggleThousands,
  onDefaultValueChange,
  onSubmit,
  onCancel,
}: DecimalSettingsProps) {
  const [scale, setScale] = useState<number>(parseInt(precision) || 2);
  const [localDefaultValue, setLocalDefaultValue] = useState<string>(defaultValue || '');
  const [showDefaultValue, setShowDefaultValue] = useState<boolean>(!!defaultValue);

  const handlePrecisionChange = (value: string) => {
    setScale(Number(value));
    onPrecisionChange?.(value);           // ← notify parent if provided
  };

  const handleDefaultValueChange = (value: string | undefined) => {
    setLocalDefaultValue(value ?? '');
    onDefaultValueChange?.(value);
  };

  const handleToggleDefaultValue = (enabled: boolean) => {
    setShowDefaultValue(enabled);
  };

  const handleSubmit = () => {
    const numericDefault =
      localDefaultValue && !isNaN(parseFloat(localDefaultValue))
        ? parseFloat(localDefaultValue)
        : undefined;

    onSubmit({
      scale,
      default_value: numericDefault,
      settings: {
        show_thousands_separator: showThousandsSeparator,
        scale,
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* Field name */}
      <Input
        placeholder="Field name ( Optional )"
        value={name}
        onChange={(e) => onNameChange(e.currentTarget.value)}
      />

      {/* Precision Chooser */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Precision</Label>
        <Select value={precision} onValueChange={handlePrecisionChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select precision" />
          </SelectTrigger>
          <SelectContent>
            {[
              { label: '1.0', value: '1' },
              { label: '1.00', value: '2' },
              { label: '1.000', value: '3' },
              { label: '1.0000', value: '4' },
            ].map(({ label, value }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between pt-2">
        <span className="text-sm font-medium">Show thousands separator</span>
        <Switch
          checked={showThousandsSeparator}
          onCheckedChange={(checked) => onToggleThousands?.(checked)}  // ← safe
        />
      </div>

      {/* Reusable default value control */}
      <DefaultValueControl
        enabled={showDefaultValue}
        value={localDefaultValue}
        inputType="number"
        inputStep={`0.${'0'.repeat(Math.max(0, scale - 1))}1`}
        defaultWhenEnable="0"
        onToggle={handleToggleDefaultValue}
        onChange={handleDefaultValueChange}
      />

      {/* Stub actions */}
      <Button variant="ghost" size="sm" className="w-full justify-start">
        <IconPlus className="h-4 w-4 mr-2" />
        Add description
      </Button>

      {/* CTA Row */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSubmit}>Save</Button>
      </div>
    </div>
  );
}
