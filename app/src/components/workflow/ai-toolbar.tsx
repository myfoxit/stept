import * as React from 'react';
import {
  Sparkles,
  FileText,
  Tag,
  Loader2,
  Check,
  CircleAlert,
  Play,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface AIToolbarProps {
  isProcessing: boolean;
  isProcessed: boolean;
  processingProgress?: { current: number; total: number } | null;
  onProcessAll: () => void;
  onGenerateGuide: () => void;
  onGuideMe?: () => void;
  hasGuide?: boolean;
  onAutoTag?: () => void;
  difficulty?: string | null;
  estimatedTime?: string | null;
  tags?: string[] | null;
}

export function AIToolbar({
  isProcessing,
  isProcessed,
  processingProgress,
  onProcessAll,
  onGenerateGuide,
  onGuideMe,
  hasGuide,
  onAutoTag,
  difficulty,
  estimatedTime,
  tags,
}: AIToolbarProps) {
  return (
    <div className="rounded-xl border border-primary200 bg-gradient-to-r from-indigo-50 to-purple-50 p-4">
      <div className="flex flex-wrap items-center gap-3">
        {/* Process All Button */}
        <Button
          onClick={onProcessAll}
          disabled={isProcessing}
          size="sm"
          className="bg-primary hover:bg-primary/90 text-white"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Processing…
            </>
          ) : isProcessed ? (
            <>
              <Check className="mr-1.5 h-4 w-4" />
              Re-process with AI
            </>
          ) : (
            <>
              <Sparkles className="mr-1.5 h-4 w-4" />
              Process with AI
            </>
          )}
        </Button>

        {/* Generate Guide Button */}
        <Button
          onClick={onGenerateGuide}
          disabled={isProcessing}
          size="sm"
          variant="outline"
          className="border-primary200 hover:bg-primary/5"
        >
          <FileText className="mr-1.5 h-4 w-4" />
          Generate Guide
        </Button>

        {/* Guide Me Button */}
        {hasGuide && onGuideMe && (
          <Button
            onClick={onGuideMe}
            disabled={isProcessing}
            size="sm"
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <Play className="mr-1.5 h-4 w-4" />
            Guide Me
          </Button>
        )}

        {/* Auto-tag Button */}
        {onAutoTag && (
          <Button
            onClick={onAutoTag}
            disabled={isProcessing}
            size="sm"
            variant="outline"
            className="border-primary200 hover:bg-primary/5"
          >
            <Tag className="mr-1.5 h-4 w-4" />
            Auto-tag
          </Button>
        )}

        {/* Status indicators */}
        <div className="ml-auto flex items-center gap-2">
          {difficulty && (
            <Badge variant="outline" className="text-xs capitalize">
              {difficulty}
            </Badge>
          )}
          {estimatedTime && (
            <Badge variant="outline" className="text-xs">
              ⏱️ {estimatedTime}
            </Badge>
          )}
          {isProcessed && (
            <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-xs">
              <Check className="mr-1 h-3 w-3" />
              AI Processed
            </Badge>
          )}
        </div>
      </div>

      {/* Progress bar during processing */}
      {isProcessing && processingProgress && (
        <div className="mt-3 space-y-1">
          <div className="flex items-center justify-between text-xs text-primary700">
            <span>Processing step {processingProgress.current}/{processingProgress.total}…</span>
            <span>{Math.round((processingProgress.current / processingProgress.total) * 100)}%</span>
          </div>
          <Progress
            value={(processingProgress.current / processingProgress.total) * 100}
            className="h-1.5"
          />
        </div>
      )}

      {/* Tags display */}
      {tags && tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="text-xs bg-primary/10 text-primary700 hover:bg-indigo-200"
            >
              {tag}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
