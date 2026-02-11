import { useCallback, useState } from 'react';
import { Responsive, WidthProvider, Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import { ChartWidget } from './ChartWidget';
import { WidgetConfigDialog } from './WidgetConfigDialog';
import type { DashboardWidget } from '@/api/dashboard';
import { useUpdateWidget, useDeleteWidget } from '@/hooks/dashboard';

const ResponsiveGridLayout = WidthProvider(Responsive);

interface DashboardGridProps {
  widgets: DashboardWidget[];
  dashboardId: string;
  onLayoutChange?: (layout: Layout[]) => void;
  isEditMode?: boolean;
}

export function DashboardGrid({ widgets, dashboardId, onLayoutChange, isEditMode = false }: DashboardGridProps) {
  const [editingWidget, setEditingWidget] = useState<DashboardWidget | null>(null);
  const { mutate: updateWidget } = useUpdateWidget();
  const { mutate: deleteWidget } = useDeleteWidget();

  const handleLayoutChange = useCallback(
    (layout: Layout[]) => {
      // Only update if in edit mode
      if (!isEditMode) return;

      // Update widget positions in backend
      layout.forEach((item) => {
        const widget = widgets.find((w) => w.id === item.i);
        if (widget && (widget.x !== item.x || widget.y !== item.y || widget.w !== item.w || widget.h !== item.h)) {
          updateWidget({
            id: widget.id,
            data: { x: item.x, y: item.y, w: item.w, h: item.h },
          });
        }
      });
      onLayoutChange?.(layout);
    },
    [widgets, updateWidget, onLayoutChange, isEditMode]
  );

  const handleEditWidget = useCallback(
    (widget: DashboardWidget) => {
      setEditingWidget(widget);
    },
    []
  );

  const handleDeleteWidget = useCallback(
    (widgetId: string) => {
      if (confirm('Delete this widget?')) {
        deleteWidget({ id: widgetId, dashboardId });
      }
    },
    [deleteWidget, dashboardId]
  );

  const layouts = {
    lg: widgets.map((w) => ({ i: w.id, x: w.x, y: w.y, w: w.w, h: w.h })),
    md: widgets.map((w) => ({ i: w.id, x: w.x, y: w.y, w: Math.min(w.w, 8), h: w.h })),
    sm: widgets.map((w) => ({ i: w.id, x: 0, y: w.y, w: 6, h: w.h })),
  };

  if (widgets.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px] text-muted-foreground">
        No widgets yet. Click "Add Widget" to get started.
      </div>
    );
  }

  return (
    <>
      <ResponsiveGridLayout
        className="layout"
        layouts={layouts}
        onLayoutChange={handleLayoutChange}
        breakpoints={{ lg: 1200, md: 768, sm: 480 }}
        cols={{ lg: 12, md: 8, sm: 1 }}
        rowHeight={80}
        isDraggable={isEditMode}
        isResizable={isEditMode}
        containerPadding={[0, 0]}
        margin={[16, 16]}
        compactType="vertical"
        draggableHandle=".drag-handle" // Only allow dragging from specific handle
      >
        {widgets.map((widget) => (
          <div key={widget.id} className="h-full">
            <ChartWidget
              widget={widget}
              onEdit={isEditMode ? () => handleEditWidget(widget) : undefined}
              onDelete={isEditMode ? () => handleDeleteWidget(widget.id) : undefined}
              isEditMode={isEditMode}
            />
          </div>
        ))}
      </ResponsiveGridLayout>

      {editingWidget && (
        <WidgetConfigDialog
          widget={editingWidget}
          dashboardId={dashboardId}
          onClose={() => setEditingWidget(null)}
        />
      )}
    </>
  );
}

