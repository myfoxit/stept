import * as React from 'react';
import { Info, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '../ui/sidebar';

interface WorkflowBannerProps {
  isEditMode: boolean;
  onToggleEdit: () => void;
  onShare: () => void;
  isPrivate?: boolean;
}

export function WorkflowBanner({ isEditMode, onToggleEdit, onShare, isPrivate }: WorkflowBannerProps) {
  // Only show the private banner when the workflow is actually private
  if (!isPrivate) return null;

  return (
    <div className="border-b border-primary/10 bg-primary/5">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-primary">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-sm">
            <Info className="h-3 w-3" />
          </span>
          <span className="hidden sm:inline">
            This Workflow is only visible to you. Make any changes, then share it.
          </span>
          <span className="inline sm:hidden">Only visible to you.</span>
        </div>
      </div>
    </div>
  );
}
