import * as React from 'react';
import { Loader2, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  useVerificationJob,
  useCancelVerification,
  type VerificationJob,
} from '@/hooks/use-staleness';

interface VerificationProgressProps {
  jobId: string;
  onDone?: () => void;
  className?: string;
}

export function VerificationProgress({
  jobId,
  onDone,
  className,
}: VerificationProgressProps) {
  const { data: job } = useVerificationJob(jobId);
  const cancelMutation = useCancelVerification();
  const doneRef = React.useRef(false);

  const isFinished =
    job?.status === 'completed' ||
    job?.status === 'failed' ||
    job?.status === 'cancelled';

  React.useEffect(() => {
    if (isFinished && !doneRef.current) {
      doneRef.current = true;
      // Small delay so user can see the result
      const t = setTimeout(() => onDone?.(), 4000);
      return () => clearTimeout(t);
    }
  }, [isFinished, onDone]);

  if (!job) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center gap-2 py-4">
          <Loader2 className="size-4 animate-spin" />
          <span className="text-sm text-muted-foreground">
            Starting verification…
          </span>
        </CardContent>
      </Card>
    );
  }

  const pct =
    job.total_steps > 0
      ? Math.round((job.current_step / job.total_steps) * 100)
      : 0;

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            {job.status === 'running' || job.status === 'pending' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : job.status === 'completed' ? (
              <CheckCircle2 className="size-4 text-green-600" />
            ) : (
              <AlertTriangle className="size-4 text-red-600" />
            )}
            {job.status === 'running'
              ? 'Verifying…'
              : job.status === 'pending'
                ? 'Queued…'
                : job.status === 'completed'
                  ? 'Verification Complete'
                  : job.status === 'cancelled'
                    ? 'Verification Cancelled'
                    : 'Verification Failed'}
          </span>
          {(job.status === 'running' || job.status === 'pending') && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => cancelMutation.mutate(jobId)}
              disabled={cancelMutation.isPending}
            >
              <X className="size-3.5 mr-1" />
              Cancel
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {(job.status === 'running' || job.status === 'pending') && (
          <>
            <Progress value={pct} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {job.current_step_label ||
                `Checking step ${job.current_step} of ${job.total_steps}…`}
            </p>
          </>
        )}

        {job.status === 'completed' && job.results && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span className="text-green-600 font-medium">
                ✓ {job.results.passed} passed
              </span>
              <span className="text-red-600 font-medium">
                ✗ {job.results.failed} failed
              </span>
              {job.results.skipped > 0 && (
                <span className="text-muted-foreground">
                  ⊘ {job.results.skipped} skipped
                </span>
              )}
            </div>
            {job.results.failed_steps.length > 0 && (
              <ul className="space-y-1 text-xs">
                {job.results.failed_steps.slice(0, 5).map((fs, i) => (
                  <li key={i} className="text-red-600">
                    {fs.workflow_name
                      ? `${fs.workflow_name} — Step ${fs.step_number}`
                      : `Step ${fs.step_number}`}
                    : {fs.reason}
                  </li>
                ))}
                {job.results.failed_steps.length > 5 && (
                  <li className="text-muted-foreground">
                    … and {job.results.failed_steps.length - 5} more
                  </li>
                )}
              </ul>
            )}
          </div>
        )}

        {job.status === 'failed' && job.error && (
          <p className="text-xs text-red-600">{job.error}</p>
        )}
      </CardContent>
    </Card>
  );
}
