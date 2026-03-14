import * as React from 'react';
import { Link } from 'react-router-dom';
import { Activity } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { HealthDot } from '@/components/health-dot';
import { VerificationProgress } from '@/components/verification-progress';
import { useRunVerification } from '@/hooks/use-staleness';
import type { ProjectHealth } from '@/hooks/use-staleness';

interface ProjectHealthCardProps {
  health: ProjectHealth;
  projectId?: string;
  className?: string;
}

function HealthBar({
  healthy,
  aging,
  stale,
  unknown,
  total,
}: {
  healthy: number;
  aging: number;
  stale: number;
  unknown: number;
  total: number;
}) {
  if (total === 0) return null;

  const pct = (n: number) => `${(n / total) * 100}%`;

  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
      {healthy > 0 && (
        <div
          className="bg-green-500 transition-all"
          style={{ width: pct(healthy) }}
        />
      )}
      {aging > 0 && (
        <div
          className="bg-yellow-500 transition-all"
          style={{ width: pct(aging) }}
        />
      )}
      {stale > 0 && (
        <div
          className="bg-red-500 transition-all"
          style={{ width: pct(stale) }}
        />
      )}
      {unknown > 0 && (
        <div
          className="bg-gray-400 transition-all"
          style={{ width: pct(unknown) }}
        />
      )}
    </div>
  );
}

export function ProjectHealthCard({
  health,
  projectId,
  className,
}: ProjectHealthCardProps) {
  const { total_workflows, healthy, aging, stale, unknown, coverage, stale_workflows } = health;
  const [activeJobId, setActiveJobId] = React.useState<string | null>(null);
  const runVerification = useRunVerification();

  const handleVerify = async (filter: 'all' | 'stale') => {
    if (!projectId) return;
    try {
      const result = await runVerification.mutateAsync({
        project_id: projectId,
        filter,
      });
      setActiveJobId(result.job_id);
    } catch {
      // error handled by mutation
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="size-4" />
          Documentation Health
        </CardTitle>
        <CardDescription>
          {total_workflows} workflow{total_workflows !== 1 ? 's' : ''} ·{' '}
          {health.total_steps} steps · Coverage:{' '}
          {coverage != null ? `${Math.round(coverage * 100)}%` : 'N/A'}
        </CardDescription>
        <CardAction>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={runVerification.isPending || !!activeJobId}
              onClick={() => handleVerify('all')}
            >
              Verify All
            </Button>
            {stale > 0 && (
              <Button
                size="sm"
                variant="outline"
                disabled={runVerification.isPending || !!activeJobId}
                onClick={() => handleVerify('stale')}
              >
                Verify Stale
              </Button>
            )}
          </div>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Active verification job */}
        {activeJobId && (
          <VerificationProgress
            jobId={activeJobId}
            onDone={() => setActiveJobId(null)}
          />
        )}

        {/* Health distribution bar */}
        <HealthBar
          healthy={healthy}
          aging={aging}
          stale={stale}
          unknown={unknown}
          total={total_workflows}
        />

        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-full bg-green-500" />
            {healthy} Healthy ({total_workflows ? Math.round((healthy / total_workflows) * 100) : 0}%)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-full bg-yellow-500" />
            {aging} Aging ({total_workflows ? Math.round((aging / total_workflows) * 100) : 0}%)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-full bg-red-500" />
            {stale} Stale ({total_workflows ? Math.round((stale / total_workflows) * 100) : 0}%)
          </span>
          {unknown > 0 && (
            <span className="flex items-center gap-1">
              <span className="inline-block size-2 rounded-full bg-gray-400" />
              {unknown} Unknown
            </span>
          )}
        </div>

        {/* Stale workflows list */}
        {stale_workflows.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              Stale workflows:
            </p>
            <ul className="space-y-1">
              {stale_workflows.map((wf) => (
                <li key={wf.id} className="flex items-center gap-2 text-sm">
                  <HealthDot
                    healthScore={wf.health_score}
                    healthStatus={wf.health_status}
                    lastVerifiedAt={null}
                  />
                  <Link
                    to={`/workflow/${wf.id}`}
                    className="hover:underline truncate"
                  >
                    {wf.name}
                  </Link>
                  <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
                    {Math.round(wf.health_score * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
