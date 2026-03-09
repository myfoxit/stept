import { useState } from 'react';
import { Languages, Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SUPPORTED_LANGUAGES, CONTENT_LANGUAGES, type LanguageCode } from '@/i18n';

interface ContentLanguageToggleProps {
  value: string; // 'original' or language code
  onChange: (lang: string) => void;
  loading?: boolean;
  compact?: boolean;
  className?: string;
}

export function ContentLanguageToggle({
  value,
  onChange,
  loading,
  compact,
  className,
}: ContentLanguageToggleProps) {
  const displayValue = value === 'original'
    ? '🇬🇧 Original'
    : SUPPORTED_LANGUAGES[value as LanguageCode]
      ? `${SUPPORTED_LANGUAGES[value as LanguageCode].flag} ${SUPPORTED_LANGUAGES[value as LanguageCode].nativeName}`
      : value;

  return (
    <div className={`inline-flex items-center gap-1.5 ${className ?? ''}`}>
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={compact ? 'h-7 text-xs gap-1 px-2 w-auto min-w-[100px]' : 'h-8 text-sm gap-1.5 px-2.5 w-auto min-w-[140px]'}>
          <Languages className="h-3.5 w-3.5 shrink-0" />
          <SelectValue>{displayValue}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="original">
            <span className="mr-2">🇬🇧</span> Original (English)
          </SelectItem>
          {CONTENT_LANGUAGES.map(({ code, nativeName, flag }) => (
            <SelectItem key={code} value={code}>
              <span className="mr-2">{flag}</span> {nativeName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
