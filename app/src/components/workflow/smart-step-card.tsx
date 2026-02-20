import * as React from 'react';
import {
  IconSparkles,
  IconRefresh,
  IconPencil,
  IconLoader2,
  IconCheck,
} from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { annotateStep, improveStep } from '@/api/processing';
import type { StepAnnotation } from '@/api/processing';

interface SmartStepOverlayProps {
  stepId?: string;
  generatedTitle?: string | null;
  generatedDescription?: string | null;
  uiElement?: string | null;
  stepCategory?: string | null;
  isAnnotated?: boolean;
  isEditMode: boolean;
  onAnnotationUpdate?: (annotation: StepAnnotation) => void;
}

const categoryColors: Record<string, string> = {
  navigation: 'bg-blue-100 text-blue-700',
  data_entry: 'bg-green-100 text-green-700',
  confirmation: 'bg-amber-100 text-amber-700',
  selection: 'bg-purple-100 text-purple-700',
  scrolling: 'bg-slate-100 text-slate-700',
  typing: 'bg-teal-100 text-teal-700',
  other: 'bg-gray-100 text-gray-700',
};

/**
 * Overlay component that renders AI annotations on top of existing step cards.
 * Shows generated title, description, category chip, and action buttons.
 */
export function SmartStepOverlay({
  stepId,
  generatedTitle,
  generatedDescription,
  uiElement,
  stepCategory,
  isAnnotated,
  isEditMode,
  onAnnotationUpdate,
}: SmartStepOverlayProps) {
  const [isReannotating, setIsReannotating] = React.useState(false);
  const [isImproving, setIsImproving] = React.useState(false);

  // Don't show overlay if generated_title is already displayed in the card header
  // (the card now uses generated_title as its primary title)
  const hasOnlyTitle = generatedTitle && !generatedDescription && !stepCategory && !uiElement;
  if (!isAnnotated && !generatedTitle) return null;
  if (hasOnlyTitle && !isEditMode) return null;

  const handleReannotate = async () => {
    if (!stepId) return;
    setIsReannotating(true);
    try {
      const result = await annotateStep(stepId);
      onAnnotationUpdate?.(result);
    } catch (err) {
      console.error('Re-annotate failed:', err);
    } finally {
      setIsReannotating(false);
    }
  };

  const handleImprove = async () => {
    if (!stepId) return;
    setIsImproving(true);
    try {
      const result = await improveStep(stepId);
      onAnnotationUpdate?.(result);
    } catch (err) {
      console.error('Improve failed:', err);
    } finally {
      setIsImproving(false);
    }
  };

  const catColor = stepCategory ? categoryColors[stepCategory] || categoryColors.other : '';

  return (
    <div className="border-t border-primary100 bg-gradient-to-r from-primary/5 to-transparent px-4 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* AI-generated title */}
          {generatedTitle && (
            <div className="flex items-center gap-1.5 mb-1">
              <IconSparkles className="h-3.5 w-3.5 text-primary500 flex-shrink-0" />
              <span className="text-sm font-medium text-primary900 truncate">{generatedTitle}</span>
            </div>
          )}
          {/* AI-generated description */}
          {generatedDescription && (
            <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">{generatedDescription}</p>
          )}
          {/* Category & UI element chips */}
          <div className="flex items-center gap-1.5 mt-1.5">
            {stepCategory && (
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${catColor}`}>
                {stepCategory.replace('_', ' ')}
              </Badge>
            )}
            {uiElement && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 bg-slate-50 text-slate-600">
                {uiElement}
              </Badge>
            )}
          </div>
        </div>

        {/* Action buttons — only in edit mode */}
        {isEditMode && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={handleReannotate}
              disabled={isReannotating || isImproving}
              title="Re-annotate with AI"
            >
              {isReannotating ? (
                <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <IconRefresh className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={handleImprove}
              disabled={isReannotating || isImproving}
              title="Improve description"
            >
              {isImproving ? (
                <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <IconPencil className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
