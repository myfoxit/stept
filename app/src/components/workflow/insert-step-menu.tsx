import * as React from 'react';
import {
  Plus,
  Lightbulb,
  CircleAlert,
  Camera,
  Heading,
  Video,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface InsertStepMenuProps {
  index: number;
  onInsert: (index: number, type: string) => void;
  stepNumber?: number;
}

export function InsertStepMenu({ index, onInsert, stepNumber }: InsertStepMenuProps) {
  return (
    <div className="relative mb-6">
      <div className="border-t border-slate-200" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-lg leading-none text-slate-500 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-48">
          <DropdownMenuItem onClick={() => onInsert(index, 'step')}>
            <div className="flex h-5 w-5 items-center justify-center rounded bg-blue-500 text-xs text-white mr-2">
              {stepNumber ?? index + 1}
            </div>
            Add Step
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onInsert(index, 'tip')}>
            <Lightbulb className="h-4 w-4 text-purple-500 mr-2" />
            Add Tip
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onInsert(index, 'alert')}>
            <CircleAlert className="h-4 w-4 text-orange-500 mr-2" />
            Add Alert
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onInsert(index, 'capture')}>
            <Camera className="h-4 w-4 text-blue-500 mr-2" />
            Add Capture
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onInsert(index, 'header')}>
            <Heading className="h-4 w-4 text-gray-600 mr-2" />
            Add Header
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onInsert(index, 'gif')}>
            <Video className="h-4 w-4 text-green-500 mr-2" />
            Add GIF
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
