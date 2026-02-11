import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  KanbanBoard,
  KanbanCard,
  KanbanCards,
  KanbanHeader,
  KanbanProvider,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@/components/KanbanView/kanban';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { useRows } from '@/hooks/api/fields';
import { useSelectOptions } from '@/hooks/api/select_options';




export type SimpleStatus = { id: string; name: string; color: string };
export type SimpleFeature = {
  id: string;
  name: string;
  status: SimpleStatus;
  order: number; 
};

export const KanbanView = ({ tableId }: { tableId: string }) => {

  const { data: options = [], isLoading: selectOptionsLoading } =
    useSelectOptions('uevozrgq26g82pg6');
  const { data: rows = [], isLoading: rowsLoading } = useRows(tableId);
  const isLoading = selectOptionsLoading || rowsLoading;


  const [features, setFeatures] = useState<SimpleFeature[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    setFeatures(
      rows.map((row, i) => {
        const status =
          options.find(
            (opt) =>
              opt.name.trim().toLowerCase() ===
              String((row as any).dragon_type?.name)
                .trim()
                .toLowerCase()
          ) ?? options[0];
        return {
          id: String((row as any).id),
          name: (row as any).name,
          status,
          order: i, 
        } as SimpleFeature;
      })
    );
  }, [rows, options, isLoading]);

  const columns = useMemo(() => {
    const map: Record<string, SimpleFeature[]> = {};
    for (const opt of options) map[opt.name] = [];
    for (const f of features) {
      const key = f.status.name;
      if (!map[key]) map[key] = [];
      map[key].push(f);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.order - b.order);
    }
    return map;
  }, [features, options]);

  const renumberColumn = (items: SimpleFeature[]): SimpleFeature[] =>
    items.map((f, idx) => ({ ...f, order: idx }));

  const flattenCols = (
    cols: Record<string, SimpleFeature[]>
  ): SimpleFeature[] => {
    const next: SimpleFeature[] = [];
    Object.keys(cols).forEach((c) => {
      cols[c].forEach((f) => next.push(f));
    });
    return next;
  };

  const findContainer = useCallback(
    (id: string): string | undefined => {
      if (columns[id]) return id;
      for (const col of Object.keys(columns)) {
        if (columns[col].some((f) => f.id === id)) return col;
      }
      return undefined;
    },
    [columns]
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeKey = String(active.id);
    const overKey = String(over.id);

    const activeContainer = findContainer(activeKey);
    const overContainer = findContainer(overKey);

    if (!activeContainer || !overContainer) return;
    if (activeContainer === overContainer && activeKey === overKey) return; 

    setFeatures((curr) => {
      const colMap: Record<string, SimpleFeature[]> = {};
      for (const opt of options) colMap[opt.name] = [];
      for (const f of curr) {
        const key = f.status.name;
        if (!colMap[key]) colMap[key] = [];
        colMap[key].push(f);
      }
      for (const key of Object.keys(colMap)) {
        colMap[key].sort((a, b) => a.order - b.order);
      }

      const fromItems = colMap[activeContainer];
      const toItems = colMap[overContainer];
      const fromIndex = fromItems.findIndex((f) => f.id === activeKey);
      if (fromIndex < 0) return curr;
      if (activeContainer === overContainer) {
        const overIndex = toItems.findIndex((f) => f.id === overKey);
        if (overIndex < 0 || overIndex === fromIndex) return curr;
        const moved = arrayMove(toItems, fromIndex, overIndex);
        colMap[activeContainer] = renumberColumn(moved);
        return flattenCols(colMap);
      }

      const [movedItem] = fromItems.splice(fromIndex, 1);
      const overIndex = toItems.findIndex((f) => f.id === overKey);
      const insertIndex = overIndex >= 0 ? overIndex : toItems.length;
      const newStatus =
        options.find((o) => o.name === overContainer) ?? movedItem.status;
      movedItem.status = newStatus;
      toItems.splice(insertIndex, 0, movedItem);

      colMap[activeContainer] = renumberColumn(fromItems);
      colMap[overContainer] = renumberColumn(toItems);
      return flattenCols(colMap);
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const activeKey = String(active.id);
    const overKey = String(over.id);

    const activeContainer = findContainer(activeKey);
    const overContainer = findContainer(overKey) ?? overKey;

    setFeatures((curr) => {
      const colMap: Record<string, SimpleFeature[]> = {};
      for (const opt of options) colMap[opt.name] = [];
      for (const f of curr) {
        const key = f.status.name;
        if (!colMap[key]) colMap[key] = [];
        colMap[key].push(f);
      }
      for (const key of Object.keys(colMap)) {
        colMap[key].sort((a, b) => a.order - b.order);
      }

      if (!activeContainer) return curr;
      if (!colMap[overContainer]) colMap[overContainer] = [];

      const fromItems = colMap[activeContainer];
      const toItems = colMap[overContainer];
      const fromIndex = fromItems.findIndex((f) => f.id === activeKey);
      if (fromIndex < 0) return curr;

      if (activeContainer === overContainer) {
        const overIndex = toItems.findIndex((f) => f.id === overKey);
        if (overIndex < 0 || overIndex === fromIndex) return curr;
        const moved = arrayMove(toItems, fromIndex, overIndex);
        colMap[activeContainer] = renumberColumn(moved);
      } else {
        const [movedItem] = fromItems.splice(fromIndex, 1);
        const overIndex = toItems.findIndex((f) => f.id === overKey);
        const insertIndex = overIndex >= 0 ? overIndex : toItems.length;
        const newStatus =
          options.find((o) => o.name === overContainer) ?? movedItem.status;
        movedItem.status = newStatus;
        toItems.splice(insertIndex, 0, movedItem);
        colMap[activeContainer] = renumberColumn(fromItems);
        colMap[overContainer] = renumberColumn(toItems);
      }

      return flattenCols(colMap);
    });
  };

  const activeFeature = activeId
    ? features.find((f) => f.id === activeId) ?? null
    : null;

  if (isLoading) {
    return null;
  }
  return (
    <KanbanProvider
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      activeFeature={activeFeature}
      className="p-4"
    >
      {options.map((status) => {
        const colItems = columns[status.name] ?? [];
        const ids = colItems.map((i) => i.id);
        return (
          <KanbanBoard key={status.name} id={status.name}>
            <KanbanHeader name={status.name} color={status.color} />
            <SortableContext
              id={status.name}
              items={ids}
              strategy={verticalListSortingStrategy}
            >
              <KanbanCards>
                {colItems.map((feature, index) => (
                  <KanbanCard
                    key={feature.id}
                    id={feature.id}
                    name={feature.name}
                    parent={status.name}
                    index={index}
                    isActive={activeId === feature.id}
                  >
                    <p className="m-0 flex-1 font-medium text-sm">
                      {feature.name}
                    </p>
                  </KanbanCard>
                ))}
              </KanbanCards>
            </SortableContext>
          </KanbanBoard>
        );
      })}
    </KanbanProvider>
  );
};

export default KanbanView;
