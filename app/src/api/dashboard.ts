import { request } from '@/lib/apiClient';

export interface DashboardWidget {
  id: string;
  dashboard_id: string;
  title: string;
  chart_type: 'bar' | 'line' | 'pie' | 'area';
  table_id: string;
  x_axis_column?: string;
  y_axis_column?: string;
  group_by_column?: string;
  aggregation?: string;
  filters?: Array<{ column: string; operator: string; value: any }>;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Dashboard {
  id: string;
  name: string;
  project_id: string;
  user_id: string;
  layout: any[];
  widgets: DashboardWidget[];
  created_at: string;
  updated_at: string;
}

export interface WidgetDataRequest {
  table_id: string;
  x_axis_column?: string;
  y_axis_column?: string;
  group_by_column?: string;
  aggregation?: string;
  filters?: Array<{ column: string; operator: string; value: any }>;
  limit?: number;
}

export const createDashboard = (data: { name: string; project_id: string }) =>
  request<Dashboard>({ method: 'POST', url: '/dashboards/', data });

export const listDashboards = (projectId: string) =>
  request<Dashboard[]>({ method: 'GET', url: `/dashboards/project/${projectId}` });

export const getDashboard = (dashboardId: string) =>
  request<Dashboard>({ method: 'GET', url: `/dashboards/${dashboardId}` });

export const updateDashboard = (dashboardId: string, data: Partial<Dashboard>) =>
  request<Dashboard>({ method: 'PUT', url: `/dashboards/${dashboardId}`, data });

export const deleteDashboard = (dashboardId: string) =>
  request({ method: 'DELETE', url: `/dashboards/${dashboardId}` });

export const addWidget = (dashboardId: string, data: Omit<DashboardWidget, 'id' | 'dashboard_id'>) =>
  request<DashboardWidget>({ method: 'POST', url: `/dashboards/${dashboardId}/widgets`, data });

export const updateWidget = (widgetId: string, data: Partial<DashboardWidget>) =>
  request<DashboardWidget>({ method: 'PUT', url: `/dashboards/widgets/${widgetId}`, data });

export const deleteWidget = (widgetId: string) =>
  request({ method: 'DELETE', url: `/dashboards/widgets/${widgetId}` });

export const getWidgetData = (requestData: WidgetDataRequest) =>
  request<{ data: Array<{ label: string; value: number }> }>({ 
    method: 'POST', 
    url: '/dashboards/widgets/data', 
    data: requestData 
  });
