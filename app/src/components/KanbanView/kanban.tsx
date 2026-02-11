import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  DndContext,
  DragOverlay,
  rectIntersection,
  useDroppable,
  type DragStartEvent as CoreDragStartEvent,
  type DragOverEvent as CoreDragOverEvent,
  type DragEndEvent as CoreDragEndEvent,
} from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { Button } from '../ui/button';
import { GripVertical } from 'lucide-react';
import { Badge } from '../ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

// Re-export as public types for consumers
export type DragStartEvent = CoreDragStartEvent;
export type DragOverEvent = CoreDragOverEvent;
export type DragEndEvent = CoreDragEndEvent;

/* Domain-ish shared types -------------------------------------------------- */
export type Status = {
  id: string;
  name: string;
  color: string;
};

export type Feature = {
  id: string;
  name: string;
  startAt: Date;
  endAt: Date;
  status: Status;
};

/* ------------------------------ Board ------------------------------------- */
export type KanbanBoardProps = {
  id: Status['id'];
  children: ReactNode;
  className?: string;
};

export const KanbanBoard = ({ id, children, className }: KanbanBoardProps) => {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <div
      className={cn(
        'flex h-full min-h-40 flex-col gap-2 rounded-md border bg-secondary p-2 text-xs shadow-sm outline outline-2 transition-all',
        isOver ? 'outline-primary' : 'outline-transparent',
        className
      )}
      ref={setNodeRef}
    >
      {children}
    </div>
  );
};

/* ------------------------------ Card -------------------------------------- */
export type KanbanCardProps = Pick<Feature, 'id' | 'name'> & {
  index: number;
  parent: string; 
  isActive?: boolean;
  children?: ReactNode;
  className?: string;
};

export const KanbanCard = ({
  id,
  name,
  index,
  parent,
  isActive = false,
  children,
  className,
}: KanbanCardProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    data: { index, parent },
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  // Dim if active; we leave element in flow so it shows placeholder position.
  const ghost = isDragging || isActive;

  return (
    <Card
      className={cn(
        'rounded-md p-3 shadow-sm transition-opacity',
        ghost && 'opacity-30',
        isDragging && 'cursor-grabbing',
        className
      )}
      style={style}
      ref={setNodeRef}
    >
      <CardHeader className="px-3 py-3 space-between flex flex-row border-b-2 border-secondary relative">
        <Button
          variant={'ghost'}
          {...attributes}
          {...listeners}
          className="p-1 text-secondary-foreground/50 -ml-2 h-auto cursor-grab"
        >
          <span className="sr-only">Move task</span>
          <GripVertical />
        </Button>
        <Badge variant={'outline'} className="ml-auto font-semibold">
          Task
        </Badge>
      </CardHeader>
      <CardContent className="px-3 pt-3 pb-6 text-left whitespace-pre-wrap">
        {children}
      </CardContent>
    </Card>
  );
};

/* ------------------------------ Cards wrapper ----------------------------- */
export type KanbanCardsProps = {
  children: ReactNode;
  className?: string;
};

export const KanbanCards = ({ children, className }: KanbanCardsProps) => (
  <div className={cn('flex flex-1 flex-col gap-2', className)}>{children}</div>
);

/* ------------------------------ Header ------------------------------------ */
export type KanbanHeaderProps =
  | { children: ReactNode }
  | { name: Status['name']; color: Status['color']; className?: string };

export const KanbanHeader = (props: KanbanHeaderProps) =>
  'children' in props ? (
    props.children
  ) : (
    <div className={cn('flex shrink-0 items-center gap-2', props.className)}>
      <div
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: props.color }}
      />
      <p className="m-0 font-semibold text-sm">{props.name}</p>
    </div>
  );

/* ------------------------------ Provider + Overlay ------------------------ */
const DragOverlayCard = ({ name }: { name: string }) => (
  <Card
    className={cn(
      'rounded-md p-3 shadow-sm opacity-90 scale-105 border-2 border-primary'
    )}
  >
    <CardHeader className="px-3 py-3 space-between flex flex-row border-b-2 border-secondary relative">
      <Button
        variant={'ghost'}
        className="p-1 text-secondary-foreground/50 -ml-2 h-auto cursor-grab"
      >
        <span className="sr-only">Move task</span>
        <GripVertical />
      </Button>
      <Badge variant={'outline'} className="ml-auto font-semibold">
        Task
      </Badge>
    </CardHeader>
    <CardContent className="px-3 pt-3 pb-6 text-left whitespace-pre-wrap">
      {name}
    </CardContent>
  </Card>
);

export type KanbanProviderProps = {
  children: ReactNode;
  onDragStart: (event: DragStartEvent) => void;
  onDragOver: (event: DragOverEvent) => void; // NEW live move
  onDragEnd: (event: DragEndEvent) => void;
  activeFeature?: { id: string; name: string } | null;
  className?: string;
};

export const KanbanProvider = ({
  children,
  onDragStart,
  onDragOver,
  onDragEnd,
  activeFeature,
  className,
}: KanbanProviderProps) => (
  <DndContext
    collisionDetection={rectIntersection}
    onDragStart={onDragStart}
    onDragOver={onDragOver}
    onDragEnd={onDragEnd}
  >
    <div
      className={cn('grid w-full auto-cols-fr grid-flow-col gap-4', className)}
    >
      {children}
    </div>

    {/* Overlay clone that follows pointer */}
    {createPortal(
      <DragOverlay dropAnimation={null}>
        {activeFeature ? <DragOverlayCard name={activeFeature.name} /> : null}
      </DragOverlay>,
      // body portal avoids clipping issues inside scroll containers
      document.body
    )}
  </DndContext>
);
