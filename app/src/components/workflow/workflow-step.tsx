import * as React from 'react';
import {
  IconPencil,
  IconZoomIn,
  IconZoomOut,
  IconDotsVertical,
  IconCopy,
  IconLink,
  IconPhoto,
  IconDownload,
  IconTrash,
} from '@tabler/icons-react';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton'; // NEW: Import skeleton
import type { WorkflowStep, ZoomState } from '@/types/workflow';

interface WorkflowStepProps {
  step: WorkflowStep;
  // backend index (API / IDs)
  stepNumber: number;
  // NEW: visible index used for UI numbering (image-only)
  visibleIndex: number;
  imageUrl: string;
  isEditMode: boolean;
  zoomState: ZoomState;
  zoomLevels: number[];
  onZoomIn: () => void;
  onZoomOut: () => void;
  onPanStart: (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => void;
  onPanMove: (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => void;
  onPanEnd: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onCopyLink?: () => void;
  onUpdateGuideLink?: () => void;
  onReplaceImage?: () => void;
  onDownloadImage?: (full: boolean) => void;
  onUpdateTitle?: (newTitle: string) => void; // NEW
  imageRef: (el: HTMLDivElement | null) => void;
}

export function WorkflowStep({
  step,
  stepNumber,
  visibleIndex, // NEW
  imageUrl,
  isEditMode,
  zoomState,
  zoomLevels,
  onZoomIn,
  onZoomOut,
  onPanStart,
  onPanMove,
  onPanEnd,
  onDelete,
  onDuplicate,
  onCopyLink,
  onUpdateGuideLink,
  onReplaceImage,
  onDownloadImage,
  onUpdateTitle, // NEW
  imageRef,
}: WorkflowStepProps) {
  // Use AI-generated title first, fall back to raw description/window_title
  const title = step.generated_title || step.description || step.window_title || `Step ${visibleIndex}`;
  const scale = zoomLevels[zoomState.zoomLevel ?? 0];

  const screenshotSize = step.screenshot_size ?? step.window_size ?? null;
  const screenshotRel = step.screenshot_relative_position;
  let circlePosition: { x: number; y: number } | null = null;

  if (screenshotRel && screenshotSize) {
    circlePosition = {
      x: (screenshotRel.x / screenshotSize.width) * 100,
      y: (screenshotRel.y / screenshotSize.height) * 100,
    };
  }

  const [editingTitle, setEditingTitle] = React.useState(false); // NEW
  const [titleDraft, setTitleDraft] = React.useState(title); // NEW
  React.useEffect(() => setTitleDraft(title), [title]); // sync if external change

  const commitTitle = () => {
    if (titleDraft !== title) {
      onUpdateTitle?.(titleDraft);
    }
    setEditingTitle(false);
  };

  // NEW: store natural image dimensions to lock layout
  const [imageDims, setImageDims] = React.useState<{ w: number; h: number } | null>(null);
  const [imageLoading, setImageLoading] = React.useState(true); // NEW: Track loading state

  return (
    <div className="flex justify-center">
      <Card className="group w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
          <div className="flex items-center gap-3 flex-1"> {/* NEW: flex-1 */}
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
              {/* NEW: show visibleIndex instead of backend stepNumber */}
              {visibleIndex}
            </div>
            <div className="flex-1 min-w-0"> {/* NEW container for full-width title */}
              {editingTitle && isEditMode ? (
                <Input
                  value={titleDraft}
                  onChange={e => setTitleDraft(e.target.value)}
                  onBlur={commitTitle}
                  onKeyDown={e => e.key === 'Enter' && commitTitle()}
                  autoFocus
                  className="h-8 w-full text-sm px-2" /* NEW: full width */
                />
              ) : (
                <div
                  className={`w-full rounded-sm px-2 py-1 text-sm font-medium text-slate-800 transition
                    ${isEditMode ? 'cursor-pointer hover:bg-indigo-50 hover:text-indigo-700' : ''}`}
                  onClick={() => isEditMode && setEditingTitle(true)}
                >
                  {titleDraft}
                </div>
              )}
            </div>
          </div>
          {isEditMode && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="invisible flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition group-hover:visible hover:bg-slate-100"
                >
                  <IconDotsVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs text-slate-400">
                  Step actions
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={onDuplicate}>
                  <IconCopy className="mr-2 h-4 w-4" />
                  <span>Duplicate Step</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onCopyLink}>
                  <IconLink className="mr-2 h-4 w-4" />
                  <span>Copy Link to Step</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onUpdateGuideLink}>
                  <IconLink className="mr-2 h-4 w-4 italic" />
                  <span>Update <span className="italic">Guide Me</span> Link</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem onClick={onReplaceImage}>
                  <IconPhoto className="mr-2 h-4 w-4" />
                  <span>Replace Image</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDownloadImage?.(false)}>
                  <IconDownload className="mr-2 h-4 w-4" />
                  <span>Download Image</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDownloadImage?.(true)}>
                  <IconDownload className="mr-2 h-4 w-4" />
                  <span>Download Full Image</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-red-600 focus:text-red-600"
                >
                  <IconTrash className="mr-2 h-4 w-4" />
                  <span>Delete Step</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="relative bg-slate-900/5 overflow-hidden">
          {/* NEW: Show skeleton while loading */}
          {imageLoading && (
            <div className="relative w-full" style={{ paddingTop: '56.25%' /* 16:9 default aspect ratio */ }}>
              <Skeleton className="absolute inset-0" />
            </div>
          )}
          
          <div
            ref={imageRef}
            className={`relative w-full cursor-grab active:cursor-grabbing select-none ${imageLoading ? 'hidden' : ''}`} // NEW: Hide while loading
            style={
              imageDims
                ? { paddingTop: `${(imageDims.h / imageDims.w) * 100}%` }
                : undefined
            }
            onMouseDown={onPanStart}
            onMouseMove={onPanMove}
            onMouseUp={onPanEnd}
            onMouseLeave={onPanEnd}
            onTouchStart={e => { e.preventDefault(); onPanStart(e); }}
            onTouchMove={e => { e.preventDefault(); onPanMove(e); }}
            onTouchEnd={onPanEnd}
          >
            <div
              className="absolute inset-0 transition-transform duration-150 ease-out will-change-transform"
              style={{
                transform: `translate(${zoomState.translateX}px, ${zoomState.translateY}px) scale(${scale})`,
                transformOrigin: 'center',
              }}
            >
              <img
                src={imageUrl}
                alt={title}
                className="block w-full h-full select-none"
                draggable={false}
                onLoad={e => {
                  const img = e.currentTarget;
                  if (!imageDims) {
                    setImageDims({ w: img.naturalWidth, h: img.naturalHeight });
                  }
                  setImageLoading(false); // NEW: Mark as loaded
                }}
                onError={() => setImageLoading(false)} // NEW: Handle error case
              />

              {circlePosition && !imageLoading && ( // NEW: Only show circle when loaded
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: `${circlePosition.x}%`,
                    top: `${circlePosition.y}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <div className="absolute -inset-4 rounded-full bg-green-500/20 animate-pulse" />
                  <div className="relative h-8 w-8 rounded-full border-2 border-green-500 bg-green-500/30">
                    <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-green-500" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {!imageLoading && ( // NEW: Only show controls when image is loaded
            <div className="pointer-events-none absolute inset-y-4 right-4 flex flex-col items-center justify-between">
              {isEditMode && (
                <button
                  type="button"
                  className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white shadow-md hover:bg-slate-50"
                >
                  <IconPencil className="h-4 w-4 text-slate-600" />
                </button>
              )}
              {!isEditMode && <div />}
              <div className="pointer-events-auto flex flex-col items-center gap-2 rounded-full bg-white/80 p-1 shadow-md">
                <button
                  type="button"
                  onClick={onZoomOut}
                  disabled={zoomState.zoomLevel <= 0}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white disabled:opacity-40"
                >
                  <IconZoomOut className="h-4 w-4 text-slate-600" />
                </button>
                <button
                  type="button"
                  onClick={onZoomIn}
                  disabled={zoomState.zoomLevel >= zoomLevels.length - 1}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white disabled:opacity-40"
                >
                  <IconZoomIn className="h-4 w-4 text-slate-600" />
                </button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
