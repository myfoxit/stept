import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bar, BarChart, Line, LineChart, Pie, PieChart, Cell, XAxis, YAxis, CartesianGrid, Area, AreaChart, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { useWidgetData } from '@/hooks/dashboard';
import type { DashboardWidget } from '@/api/dashboard';
import { Loader2, Settings, X, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChartWidgetProps {
  widget: DashboardWidget;
  onEdit?: () => void;
  onDelete?: () => void;
  isEditMode?: boolean;
  className?: string;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

export function ChartWidget({ widget, onEdit, onDelete, isEditMode = false, className }: ChartWidgetProps) {
  const { data, isLoading, error } = useWidgetData({
    table_id: widget.table_id,
    x_axis_column: widget.x_axis_column,
    y_axis_column: widget.y_axis_column,
    group_by_column: widget.group_by_column,
    aggregation: widget.aggregation,
    filters: widget.filters,
  });

  const chartData = data?.data || [];

  const renderChart = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          Error loading data
        </div>
      );
    }

    if (!chartData.length) {
      return (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          No data available
        </div>
      );
    }

    switch (widget.chart_type) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="var(--color-primary)" />
            </BarChart>
          </ResponsiveContainer>
        );

      case 'line':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip />
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke="var(--color-primary)" 
                strokeWidth={2}
                dot={{ fill: 'var(--color-primary)', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        );

      case 'pie':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip />
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(entry) => entry.label}
                outerRadius={80}
                fill="var(--color-primary)"
                dataKey="value"
              >
                {chartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        );

      case 'area':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip />
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke="var(--color-primary)" 
                fill="var(--color-primary)" 
                fillOpacity={0.6}
              />
            </AreaChart>
          </ResponsiveContainer>
        );

      default:
        return <div>Unsupported chart type</div>;
    }
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onEdit?.();
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onDelete?.();
  };

  return (
    <Card className={cn("h-full", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          {isEditMode && (
            <div className="drag-handle cursor-move p-1 hover:bg-muted rounded">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
          <div>
            <CardTitle className="text-base font-medium">{widget.title}</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              {widget.aggregation} • {widget.chart_type}
            </CardDescription>
          </div>
        </div>
        {isEditMode && (
          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6 relative z-10" 
              onClick={handleEdit}
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <Settings className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6 relative z-10" 
              onClick={handleDelete}
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="h-[calc(100%-5rem)] pt-4">
        {renderChart()}
      </CardContent>
    </Card>
  );
}
