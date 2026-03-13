import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface HealthDotProps {
  healthScore: number | null;
  healthStatus: string | null;
  lastVerifiedAt: string | null;
  className?: string;
}

function getColor(score: number | null, status: string | null) {
  if (score === null || score === undefined || status === null || status === 'unknown') {
    return 'bg-gray-400';
  }
  if (score >= 0.8) return 'bg-green-500';
  if (score >= 0.6) return 'bg-yellow-500';
  return 'bg-red-500';
}

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 30) return `${diffDays}d ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

export function HealthDot({
  healthScore,
  healthStatus,
  lastVerifiedAt,
  className,
}: HealthDotProps) {
  const color = getColor(healthScore, healthStatus);
  const label =
    healthScore !== null && healthScore !== undefined
      ? `Health: ${Math.round(healthScore * 100)}%`
      : 'Health: Unknown';
  const verified = `Last verified: ${formatRelative(lastVerifiedAt)}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-block size-1.5 rounded-full flex-shrink-0',
            color,
            className,
          )}
          aria-label={label}
        />
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <p>{label}</p>
        <p className="text-muted-foreground">{verified}</p>
      </TooltipContent>
    </Tooltip>
  );
}
