import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CommentButtonProps {
  count: number;
  onClick: () => void;
}

export function CommentButton({ count, onClick }: CommentButtonProps) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} className="gap-1.5">
      <MessageSquare className="h-4 w-4" />
      {count > 0 && <span className="text-xs font-medium">{count}</span>}
    </Button>
  );
}
