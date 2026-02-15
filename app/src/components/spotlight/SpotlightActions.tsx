import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { IconCheck, IconX, IconLoader2 } from '@tabler/icons-react';
import { confirmAction } from '@/api/spotlight';

export interface ActionCard {
  id: string;
  action: string;
  label: string;
  params: Record<string, unknown>;
}

interface SpotlightActionsProps {
  actions: ActionCard[];
  projectId?: string;
  onActionComplete?: (action: ActionCard, result: Record<string, unknown>) => void;
  onActionDismiss?: (action: ActionCard) => void;
}

export function SpotlightActions({
  actions,
  projectId,
  onActionComplete,
  onActionDismiss,
}: SpotlightActionsProps) {
  const [executing, setExecuting] = useState<Record<string, boolean>>({});
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const handleConfirm = async (action: ActionCard) => {
    setExecuting((prev) => ({ ...prev, [action.id]: true }));
    try {
      const resp = await confirmAction(action.action, action.params, projectId);
      onActionComplete?.(action, resp.result);
    } catch (err) {
      console.error('Action failed:', err);
    } finally {
      setExecuting((prev) => ({ ...prev, [action.id]: false }));
    }
  };

  const handleDismiss = (action: ActionCard) => {
    setDismissed((prev) => new Set(prev).add(action.id));
    onActionDismiss?.(action);
  };

  const visibleActions = actions.filter((a) => !dismissed.has(a.id));
  if (visibleActions.length === 0) return null;

  return (
    <div className="space-y-2 p-2">
      {visibleActions.map((action) => (
        <div
          key={action.id}
          className="flex items-center justify-between rounded-md border border-border bg-muted/50 p-3"
        >
          <span className="text-sm">📄 {action.label}</span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="default"
              className="h-7 px-2 text-xs"
              disabled={executing[action.id]}
              onClick={() => handleConfirm(action)}
            >
              {executing[action.id] ? (
                <IconLoader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <IconCheck className="mr-1 h-3 w-3" />
              )}
              Confirm
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              disabled={executing[action.id]}
              onClick={() => handleDismiss(action)}
            >
              <IconX className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
