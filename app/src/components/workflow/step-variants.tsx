import * as React from 'react';
import {
  IconBulb,
  IconAlertCircle,
  IconCamera,
  IconHeading,
  IconVideo,
  IconUpload,
} from '@tabler/icons-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  IconDotsVertical,
  IconCopy,
  IconLink,
  IconPhoto,
  IconDownload,
  IconTrash,
  IconPencil,
} from '@tabler/icons-react';

interface StepVariantProps {
  stepNumber: number; // still passed but no longer displayed for non-image variants
  content?: string;
  description?: string;
  isEditMode: boolean;
  onUpdate?: (content: string, description?: string) => void;
  onDelete?: () => void;
  onUploadImage?: () => void;
  onDuplicate?: () => void;
  onCopyLink?: () => void;
  onReplaceImage?: () => void;
  onDownloadImage?: (full: boolean) => void;
}

function VariantMenu({
  onDuplicate,
  onCopyLink,
  onReplaceImage,
  onDownloadImage,
  onDelete,
}: StepVariantProps) {
  if (!onDelete) return null;
  return (
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
        <DropdownMenuLabel className="text-xs text-slate-400">Step actions</DropdownMenuLabel>
        {onDuplicate && (
          <DropdownMenuItem onClick={onDuplicate}>
            <IconCopy className="mr-2 h-4 w-4" /> Duplicate Step
          </DropdownMenuItem>
        )}
        {onCopyLink && (
          <DropdownMenuItem onClick={onCopyLink}>
            <IconLink className="mr-2 h-4 w-4" /> Copy Link
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {onReplaceImage && (
          <DropdownMenuItem onClick={onReplaceImage}>
            <IconPhoto className="mr-2 h-4 w-4" /> Replace Image
          </DropdownMenuItem>
        )}
        {onDownloadImage && (
          <>
            <DropdownMenuItem onClick={() => onDownloadImage(false)}>
              <IconDownload className="mr-2 h-4 w-4" /> Download Image
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDownloadImage(true)}>
              <IconDownload className="mr-2 h-4 w-4" /> Download Full
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onDelete}
          className="text-red-600 focus:text-red-600"
        >
          <IconTrash className="mr-2 h-4 w-4" /> Delete Step
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// HEADER STEP (title editable + menu)
export function HeaderStep({
  stepNumber,
  content,
  description,
  isEditMode,
  onUpdate,
  onDelete,
  onDuplicate,
  onCopyLink,
  onReplaceImage,
  onDownloadImage
}: StepVariantProps) {
  const [editingTitle, setEditingTitle] = React.useState(false);
  // NEW: remove numeric default, just "Header"
  const titleValue = description ?? 'Header';
  const [title, setTitle] = React.useState(titleValue);
  const commitTitle = () => {
    onUpdate?.(content || title, title);
    setEditingTitle(false);
  };
  return (
    <div className="flex justify-center">
      <div className="group relative w-full max-w-3xl px-6 py-8">
        {/* NOTE: sr-only is still okay for accessibility but does not show visually */}
        <span className="sr-only">Step {stepNumber}</span>
        <div className="flex items-center gap-6">
          <div className="h-px flex-1 bg-slate-200" />
          {editingTitle && isEditMode ? (
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={e => e.key === 'Enter' && commitTitle()}
              autoFocus
              className="h-8 w-auto min-w-[160px] text-center text-sm font-medium"
            />
          ) : (
            <div
              className={cn(
                "px-2 text-sm font-medium text-slate-800",
                isEditMode && "cursor-pointer hover:text-indigo-700"
              )}
              onClick={() => isEditMode && setEditingTitle(true)}
            >
              {title}
            </div>
          )}
          {isEditMode && (
            <button
              type="button"
              onClick={() => setEditingTitle(true)}
              className="rounded p-1 text-slate-400 hover:text-slate-600"
            >
              <IconPencil className="h-4 w-4" />
            </button>
          )}
          <div className="h-px flex-1 bg-slate-200" />
        </div>
        {isEditMode && (
          <div className="absolute top-2 right-2">
            <VariantMenu
              stepNumber={stepNumber}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              onCopyLink={onCopyLink}
              onReplaceImage={onReplaceImage}
              onDownloadImage={onDownloadImage}
            />
          </div>
        )}
        
      </div>
    </div>
  );
}

// TIP STEP (title + body editable + menu)
export function TipStep({
  stepNumber,
  content,
  description,
  isEditMode,
  onUpdate,
  onDelete,
  onDuplicate,
  onCopyLink,
  onReplaceImage,
  onDownloadImage
}: StepVariantProps) {
  const [editingBody, setEditingBody] = React.useState(false);
  const [editingTitle, setEditingTitle] = React.useState(false);
  // NEW: no numeric default, just "Tip"
  const [title, setTitle] = React.useState(description || 'Tip');
  const [body, setBody] = React.useState(content || '');
  const commit = () => {
    onUpdate?.(body, title);
    setEditingBody(false);
    setEditingTitle(false);
  };
  return (
    <div className="flex justify-center">
      <Card className="group w-full max-w-3xl overflow-hidden rounded-2xl border-green-200 bg-green-50">
        <div className="flex items-center justify-between border-b border-green-100 bg-green-100/50 px-4 py-3">
          <div className="flex items-center gap-3">
         
            {editingTitle && isEditMode ? (
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                onBlur={commit}
                onKeyDown={e => e.key === 'Enter' && commit()}
                autoFocus
                className="h-8 w-full text-sm px-2"
              />
            ) : (
              <div
                className={cn(
                  "w-full rounded-sm px-2 py-1 text-sm font-medium text-green-800 transition",
                  isEditMode && "cursor-pointer hover:bg-green-100 hover:text-green-900"
                )}
                onClick={() => isEditMode && setEditingTitle(true)}
              >
                {title}
              </div>
            )}
          </div>
          {isEditMode && (
            <VariantMenu
              stepNumber={stepNumber}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              onCopyLink={onCopyLink}
              onReplaceImage={onReplaceImage}
              onDownloadImage={onDownloadImage}
            />
          )}
        </div>
        <div className="flex items-start gap-3 p-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
            <IconBulb className="h-5 w-5 text-green-600" />
          </div>
          <div className="flex-1">
            {editingBody && isEditMode ? (
              <Textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                onBlur={commit}
                autoFocus
                className="min-h-[60px] border-green-200 bg-white"
                placeholder="Enter your tip..."
              />
            ) : (
              <div
                className={cn(
                  "text-sm text-green-800",
                  isEditMode && "cursor-pointer hover:text-green-900",
                  !body && "italic text-green-600"
                )}
                onClick={() => isEditMode && setEditingBody(true)}
              >
                {body || (isEditMode ? 'Click to add tip content' : 'No content')}
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

// ALERT STEP (title + body editable + menu)
export function AlertStep({
  stepNumber,
  content,
  description,
  isEditMode,
  onUpdate,
  onDelete,
  onDuplicate,
  onCopyLink,
  onReplaceImage,
  onDownloadImage
}: StepVariantProps) {
  const [editingBody, setEditingBody] = React.useState(false);
  const [editingTitle, setEditingTitle] = React.useState(false);
  // NEW: no numeric default, just "Alert"
  const [title, setTitle] = React.useState(description || 'Alert');
  const [body, setBody] = React.useState(content || '');
  const commit = () => {
    onUpdate?.(body, title);
    setEditingBody(false);
    setEditingTitle(false);
  };
  return (
    <div className="flex justify-center">
      <Card className="group w-full max-w-3xl overflow-hidden rounded-2xl border-red-200 bg-red-50">
        <div className="flex items-center justify-between border-b border-red-100 bg-red-100/50 px-4 py-3">
          <div className="flex items-center gap-3">
            {editingTitle && isEditMode ? (
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                onBlur={commit}
                onKeyDown={e => e.key === 'Enter' && commit()}
                autoFocus
                className="h-8 w-full text-sm px-2"
              />
            ) : (
              <div
                className={cn(
                  "w-full rounded-sm px-2 py-1 text-sm font-medium text-red-800 transition",
                  isEditMode && "cursor-pointer hover:bg-red-100 hover:text-red-900"
                )}
                onClick={() => isEditMode && setEditingTitle(true)}
              >
                {title}
              </div>
            )}
          </div>
          {isEditMode && (
            <VariantMenu
              stepNumber={stepNumber}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              onCopyLink={onCopyLink}
              onReplaceImage={onReplaceImage}
              onDownloadImage={onDownloadImage}
            />
          )}
        </div>
        <div className="flex items-start gap-3 p-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
            <IconAlertCircle className="h-5 w-5 text-red-600" />
          </div>
          <div className="flex-1">
            {editingBody && isEditMode ? (
              <Textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                onBlur={commit}
                autoFocus
                className="min-h-[60px] border-red-200 bg-white"
                placeholder="Enter alert message..."
              />
            ) : (
              <div
                className={cn(
                  "text-sm text-red-800",
                  isEditMode && "cursor-pointer hover:text-red-900",
                  !body && "italic text-red-600"
                )}
                onClick={() => isEditMode && setEditingBody(true)}
              >
                {body || (isEditMode ? 'Click to add alert content' : 'No content')}
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

export function EmptyImageStep({
  stepNumber,
  description,
  isEditMode,
  onUploadImage,
  onDelete,
  onDuplicate,
  onCopyLink,
  onReplaceImage,
  onDownloadImage,
  onUpdate
}: StepVariantProps) {
  const [editingTitle, setEditingTitle] = React.useState(false);
  // NEW: do not include step number in default
  const [title, setTitle] = React.useState(description || 'Step');
  const commitTitle = () => {
    onUpdate?.(title, title); // content not relevant here
    setEditingTitle(false);
  };
  const [isDragOver, setIsDragOver] = React.useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    onUploadImage?.();
  };

  return (
    <div className="flex justify-center">
      <Card className="group w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
          <div className="flex items-center gap-3">
            {/* NEW: remove numbered circle for empty image step */}
            {/* <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
              {stepNumber}
            </div> */}
            {/* EMPTY IMAGE STEP title block changes */}
            {editingTitle && isEditMode ? (
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={e => e.key === 'Enter' && commitTitle()}
                autoFocus
                className="h-8 w-full text-sm px-2"
              />
            ) : (
              <div
                className={cn(
                  "w-full rounded-sm px-2 py-1 text-sm font-medium text-slate-800 transition",
                  isEditMode && "cursor-pointer hover:bg-indigo-50 hover:text-indigo-700"
                )}
                onClick={() => isEditMode && setEditingTitle(true)}
              >
                {title}
              </div>
            )}
          </div>
          {isEditMode && (
            <VariantMenu
              stepNumber={stepNumber}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              onCopyLink={onCopyLink}
              onReplaceImage={onReplaceImage}
              onDownloadImage={onDownloadImage}
            />
          )}
        </div>
        <div
          className={cn(
            "relative bg-slate-50 transition-all",
            isDragOver && "bg-indigo-50",
            isEditMode && "cursor-pointer hover:bg-slate-100"
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => isEditMode && onUploadImage?.()}
        >
          <div className="flex h-64 flex-col items-center justify-center gap-3 p-8">
            <div className={cn(
              "rounded-full p-3 transition-colors",
              isDragOver ? "bg-indigo-100" : "bg-slate-100 group-hover:bg-slate-200"
            )}>
              <IconUpload className={cn(
                "h-8 w-8 transition-colors",
                isDragOver ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600"
              )} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-700">
                {isDragOver ? "Drop image here" : "Add an image"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {isEditMode ? "Click or drag & drop to upload" : "No image uploaded"}
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
