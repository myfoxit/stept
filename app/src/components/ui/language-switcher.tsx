import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SUPPORTED_LANGUAGES, type LanguageCode } from '@/i18n';

interface LanguageSwitcherProps {
  compact?: boolean;
  className?: string;
}

export function LanguageSwitcher({ compact, className }: LanguageSwitcherProps) {
  const { i18n } = useTranslation();

  const currentLang = (i18n.language in SUPPORTED_LANGUAGES
    ? i18n.language
    : 'en') as LanguageCode;

  return (
    <Select
      value={currentLang}
      onValueChange={(value) => i18n.changeLanguage(value)}
    >
      <SelectTrigger className={className ?? (compact ? 'w-[120px] h-8 text-xs' : 'w-[160px]')}>
        <Globe className="h-3.5 w-3.5 mr-1.5 shrink-0" />
        <SelectValue>
          {compact
            ? SUPPORTED_LANGUAGES[currentLang].flag + ' ' + currentLang.toUpperCase()
            : SUPPORTED_LANGUAGES[currentLang].nativeName}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {(Object.entries(SUPPORTED_LANGUAGES) as [LanguageCode, typeof SUPPORTED_LANGUAGES[LanguageCode]][]).map(
          ([code, { nativeName, flag }]) => (
            <SelectItem key={code} value={code}>
              <span className="mr-2">{flag}</span>
              {nativeName}
            </SelectItem>
          )
        )}
      </SelectContent>
    </Select>
  );
}
