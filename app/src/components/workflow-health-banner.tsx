import * as React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { WorkflowHealth, StepHealth } from '@/hooks/use-staleness';

interface WorkflowHealthBannerProps {
  health: WorkflowHealth;
  className?: string;
}

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return 'unknown';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 30) return `${diffDays} days ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

export function WorkflowHealthBanner({
  health,
  className,
}: WorkflowHealthBannerProps) {
  const [dismissed, setDismissed] = React.useState(false);

  // Don't show banner if healthy or unknown, or if dismissed
  if (
    dismissed ||
    health.health_score === null ||
    health.health_score >= 0.8 ||
    health.health_status === 'unknown'
  ) {
    return null;
  }

  const failedSteps = health.steps.filter(
    (s) => s.status === 'failed' && s.is_reliable,
  );
  const isStale = health.health_score < 0.6;
  const variant = isStale ? 'destructive' : 'default';

  return (
    <Alert
      variant={variant}
      className={cn(
        isStale
          ? 'border-red-200 bg-red-50 text-red-900'
          : 'border-yellow-200 bg-yellow-50 text-yellow-900',
        className,
      )}
    >
      <AlertTriangle className="size-4" />
      <AlertTitle className="flex items-center justify-between">
        <span>
          {failedSteps.length} step{failedSteps.length !== 1 ? 's' : ''} may be
          outdated — Last verified {formatRelative(health.last_verified_at)}
        </span>
        <button
          onClick={() => setDismissed(true)}
          className="rounded-sm p-0.5 hover:bg-black/10 transition-colors"
          aria-label="Dismiss"
        >
          <X className="size-3.5" />
        </button>
      </AlertTitle>
      <AlertDescription>
        {failedSteps.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-sm">
            {failedSteps.map((step) => (
              <li key={step.step_number} className="flex items-start gap-1.5">
                <span className="font-medium">Step {step.step_number}:</span>
                <span>
                  {step.llm_explanation || 'Element not found'}
                  {step.failing_since && (
                    <span className="text-muted-foreground">
                      {' '}
                      (since{' '}
                      {new Date(step.failing_since).toLocaleDateString()})
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" variant="outline" disabled title="Coming in Phase 2">
            Verify Now
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDismissed(true)}
          >
            Dismiss
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
