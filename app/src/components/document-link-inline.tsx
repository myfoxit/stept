import { Button } from '@/components/ui/button';
import { IconLink } from '@tabler/icons-react';
import { cn } from '@/lib/utils';

interface DocumentLinkInlineProps {
  docId: string;
  className?: string;
}

/**
 * Inline document link — table linking functionality was removed.
 * This component is a placeholder for future document-to-document linking.
 */
export function DocumentLinkInline({
  docId,
  className,
}: DocumentLinkInlineProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled
      className={cn(className)}
    >
      <IconLink className="h-4 w-4 mr-2" />
      <span className="hidden sm:inline">Link Document</span>
    </Button>
  );
}
