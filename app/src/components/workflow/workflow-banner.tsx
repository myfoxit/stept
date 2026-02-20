import * as React from 'react';
import { IconInfoCircle, IconPencil } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '../ui/sidebar';

interface WorkflowBannerProps {
  isEditMode: boolean;
  onToggleEdit: () => void;
  onShare: () => void;
}

export function WorkflowBanner({ isEditMode, onToggleEdit, onShare }: WorkflowBannerProps) {
  return (
    <div className="border-b border-primary/10 bg-primary/5">
     
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-primary">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-sm">
            <IconInfoCircle className="h-3 w-3" />
          </span>
          <span className="hidden sm:inline">
            This Workflow is only visible to you. Make any changes, then share it.
          </span>
          <span className="inline sm:hidden">Only visible to you.</span>
        </div>
        <div className="flex items-center gap-2">
          {isEditMode ? (
            <Button size="sm" onClick={onToggleEdit}>
              Done Editing
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={onToggleEdit}>
              <IconPencil className="mr-1 h-3 w-3" />
              Edit
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onShare}>
            Share
          </Button>
        </div>
      </div>
    </div>
  );
}
