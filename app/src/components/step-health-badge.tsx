import { CheckCircle2, AlertTriangle, Circle, HelpCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { StepHealth } from '@/hooks/use-staleness';

interface StepHealthBadgeProps {
  stepHealth: StepHealth | undefined;
  className?: string;
}

function formatMethod(method: string | null): string {
  if (!method) return 'N/A';
  const names: Record<string, string> = {
    selector: 'CSS selector',
    testid: 'data-testid',
    'role+text': 'ARIA role + text',
    'tag+text': 'Tag + text',
    xpath: 'XPath',
    'parent-context': 'Parent chain',
  };
  return names[method] || method;
}

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return '1d ago';
  if (diffDays < 30) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

export function StepHealthBadge({ stepHealth, className }: StepHealthBadgeProps) {
  if (!stepHealth) return null;

  const { status, reliability, is_reliable, last_method, last_checked, finder_confidence, llm_explanation } = stepHealth;

  let icon: React.ReactNode;
  let label: string;
  let colorClass: string;

  switch (status) {
    case 'passed':
      icon = <CheckCircle2 className="size-3.5" />;
      label = `Verified ${formatRelative(last_checked)}`;
      colorClass = 'text-green-600';
      break;
    case 'failed':
      icon = <AlertTriangle className="size-3.5" />;
      label = 'Not found';
      colorClass = 'text-red-600';
      break;
    case 'unreliable':
      icon = <Circle className="size-3.5" />;
      label = "Can't auto-verify";
      colorClass = 'text-gray-400';
      break;
    case 'needs_auth':
      icon = <HelpCircle className="size-3.5" />;
      label = 'Needs authentication';
      colorClass = 'text-yellow-600';
      break;
    default:
      icon = <Circle className="size-3.5" />;
      label = 'Unknown';
      colorClass = 'text-gray-400';
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex items-center gap-1 text-xs',
            colorClass,
            className,
          )}
        >
          {icon}
          <span className="hidden sm:inline">{label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs space-y-1">
        <p className="font-medium">{label}</p>
        {last_checked && <p>Last check: {formatRelative(last_checked)}</p>}
        {last_method && <p>Method: {formatMethod(last_method)}</p>}
        {finder_confidence != null && (
          <p>Confidence: {Math.round(finder_confidence * 100)}%</p>
        )}
        {is_reliable !== undefined && (
          <p>Reliability: {Math.round(reliability * 100)}%</p>
        )}
        {llm_explanation && (
          <p className="text-muted-foreground italic">💡 {llm_explanation}</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
