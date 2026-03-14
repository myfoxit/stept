import * as React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  XCircle,
  Loader2,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  useResolveAlert,
  useDismissAlert,
  type StepHealth,
} from '@/hooks/use-staleness';

interface StepHealthDetailProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stepHealth: StepHealth | null;
  stepNumber: number;
}

function StatusBadge({ status }: { status: StepHealth['status'] }) {
  switch (status) {
    case 'passed':
      return (
        <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
          <CheckCircle2 className="size-3 mr-1" /> Passed
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">
          <AlertTriangle className="size-3 mr-1" /> Failed
        </Badge>
      );
    case 'needs_auth':
      return (
        <Badge variant="outline" className="text-yellow-600 border-yellow-200 bg-yellow-50">
          <Clock className="size-3 mr-1" /> Needs Auth
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-gray-500">
          {status}
        </Badge>
      );
  }
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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

export function StepHealthDetail({
  open,
  onOpenChange,
  stepHealth,
  stepNumber,
}: StepHealthDetailProps) {
  const resolveAlert = useResolveAlert();
  const dismissAlert = useDismissAlert();

  if (!stepHealth) return null;

  const alertId = stepHealth.alert_id;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Step {stepNumber} Health</SheetTitle>
          <SheetDescription>
            Verification details and history
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Status overview */}
          <div className="flex items-center justify-between">
            <StatusBadge status={stepHealth.status} />
            <span className="text-sm text-muted-foreground">
              Reliability: {Math.round(stepHealth.reliability * 100)}%
            </span>
          </div>

          {/* Key details */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Last Checked</p>
              <p className="font-medium">{formatDate(stepHealth.last_checked)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Method</p>
              <p className="font-medium">{formatMethod(stepHealth.last_method)}</p>
            </div>
            {stepHealth.finder_confidence != null && (
              <div>
                <p className="text-muted-foreground text-xs">Confidence</p>
                <p className="font-medium">
                  {Math.round(stepHealth.finder_confidence * 100)}%
                </p>
              </div>
            )}
            {stepHealth.failing_since && (
              <div>
                <p className="text-muted-foreground text-xs">Failing Since</p>
                <p className="font-medium text-red-600">
                  {formatDate(stepHealth.failing_since)}
                </p>
              </div>
            )}
          </div>

          {/* LLM explanation */}
          {stepHealth.llm_explanation && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  AI Explanation
                </p>
                <p className="text-sm bg-muted/50 rounded-md p-3 italic">
                  💡 {stepHealth.llm_explanation}
                </p>
              </div>
            </>
          )}

          {/* Recent checks */}
          {stepHealth.last_results && stepHealth.last_results.length > 0 && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Last {stepHealth.last_results.length} Checks
                </p>
                <div className="space-y-1.5">
                  {stepHealth.last_results.map((result, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="flex items-center gap-1.5">
                        {result.status === 'passed' ? (
                          <CheckCircle2 className="size-3.5 text-green-600" />
                        ) : (
                          <XCircle className="size-3.5 text-red-600" />
                        )}
                        {result.status === 'passed' ? 'Passed' : 'Failed'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(result.checked_at)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Actions */}
          {stepHealth.status === 'failed' && alertId && (
            <>
              <Separator />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    resolveAlert.mutate(alertId, {
                      onSuccess: () => onOpenChange(false),
                    });
                  }}
                  disabled={resolveAlert.isPending}
                >
                  {resolveAlert.isPending ? (
                    <Loader2 className="size-3.5 mr-1 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-3.5 mr-1" />
                  )}
                  Mark as Resolved
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="flex-1"
                  onClick={() => {
                    dismissAlert.mutate(alertId, {
                      onSuccess: () => onOpenChange(false),
                    });
                  }}
                  disabled={dismissAlert.isPending}
                >
                  {dismissAlert.isPending ? (
                    <Loader2 className="size-3.5 mr-1 animate-spin" />
                  ) : (
                    <XCircle className="size-3.5 mr-1" />
                  )}
                  Ignore This Step
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
