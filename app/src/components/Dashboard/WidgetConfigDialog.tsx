import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { useAddWidget, useUpdateWidget } from '@/hooks/dashboard';
import type { DashboardWidget } from '@/api/dashboard';
import { useColumns } from '@/hooks/api/columns';
import { useTables } from '@/hooks/api/tables';

interface WidgetConfigDialogProps {
  widget?: DashboardWidget | null;
  dashboardId: string;
  projectId?: string;
  onClose: () => void;
}

export function WidgetConfigDialog({ widget, dashboardId, projectId, onClose }: WidgetConfigDialogProps) {
  const [title, setTitle] = useState(widget?.title || '');
  const [chartType, setChartType] = useState<'bar' | 'line' | 'pie' | 'area'>(widget?.chart_type || 'bar');
  const [tableId, setTableId] = useState(widget?.table_id || '');
  const [xAxisColumn, setXAxisColumn] = useState(widget?.x_axis_column || 'none');  // Changed from '' to 'none'
  const [yAxisColumn, setYAxisColumn] = useState(widget?.y_axis_column || 'none');  // Changed from '' to 'none'
  const [groupByColumn, setGroupByColumn] = useState(widget?.group_by_column || 'none');  // Changed from '' to 'none'
  const [aggregation, setAggregation] = useState(widget?.aggregation || 'count');

  const { data: tables } = useTables(projectId || '');
  const { data: columns } = useColumns(tableId);
  const { mutate: addWidget, isLoading: isAdding } = useAddWidget();
  const { mutate: updateWidget, isLoading: isUpdating } = useUpdateWidget();

  const handleSave = () => {
    const widgetData = {
      title,
      chart_type: chartType,
      table_id: tableId,
      x_axis_column: xAxisColumn === 'none' ? undefined : xAxisColumn,  // Convert 'none' back to undefined
      y_axis_column: yAxisColumn === 'none' ? undefined : yAxisColumn,  // Convert 'none' back to undefined
      group_by_column: groupByColumn === 'none' ? undefined : groupByColumn,  // Convert 'none' back to undefined
      aggregation,
      x: widget?.x || 0,
      y: widget?.y || 0,
      w: widget?.w || 6,
      h: widget?.h || 4,
    };

    if (widget) {
      updateWidget({ id: widget.id, data: widgetData }, { onSuccess: onClose });
    } else {
      addWidget({ dashboardId, widget: widgetData }, { onSuccess: onClose });
    }
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{widget ? 'Edit Widget' : 'Add Widget'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Widget title"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="chart">Chart Type</Label>
            <Select value={chartType} onValueChange={(v) => setChartType(v as any)}>
              <SelectTrigger id="chart">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bar">Bar Chart</SelectItem>
                <SelectItem value="line">Line Chart</SelectItem>
                <SelectItem value="pie">Pie Chart</SelectItem>
                <SelectItem value="area">Area Chart</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="table">Table</Label>
            <Select value={tableId} onValueChange={setTableId}>
              <SelectTrigger id="table">
                <SelectValue placeholder="Select a table" />
              </SelectTrigger>
              <SelectContent>
                {tables?.map((table) => (
                  <SelectItem key={table.id} value={table.id}>
                    {table.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {columns && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="group">Group By</Label>
                <Select value={groupByColumn} onValueChange={setGroupByColumn}>
                  <SelectTrigger id="group">
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>  {/* Changed from "" to "none" */}
                    {columns.map((col) => (
                      <SelectItem key={col.id} value={col.name}>
                        {col.display_name || col.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="aggregation">Aggregation</Label>
                <Select value={aggregation} onValueChange={setAggregation}>
                  <SelectTrigger id="aggregation">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="count">Count</SelectItem>
                    <SelectItem value="sum">Sum</SelectItem>
                    <SelectItem value="avg">Average</SelectItem>
                    <SelectItem value="min">Min</SelectItem>
                    <SelectItem value="max">Max</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {aggregation !== 'count' && (
                <div className="grid gap-2">
                  <Label htmlFor="value">Value Column</Label>
                  <Select value={yAxisColumn} onValueChange={setYAxisColumn}>
                    <SelectTrigger id="value">
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>  {/* Changed from no option to explicit "none" */}
                      {columns
                        .filter((col) => col.ui_type === 'decimal' || col.ui_type === 'number' || col.ui_type === 'single_line_text')
                        .map((col) => (
                          <SelectItem key={col.id} value={col.name}>
                            {col.display_name || col.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!title || !tableId || isAdding || isUpdating}>
            {widget ? 'Update' : 'Add'} Widget
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
