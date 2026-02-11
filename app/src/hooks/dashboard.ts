import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createDashboard,
  listDashboards,
  getDashboard,
  updateDashboard,
  deleteDashboard,
  addWidget,
  updateWidget,
  deleteWidget,
  getWidgetData,
  type Dashboard,
  type DashboardWidget,
  type WidgetDataRequest,
} from '@/api/dashboard';

export const useDashboards = (projectId: string) =>
  useQuery<Dashboard[]>({
    queryKey: ['dashboards', projectId],
    queryFn: () => listDashboards(projectId),
    enabled: !!projectId,
  });

export const useDashboard = (dashboardId: string) =>
  useQuery<Dashboard>({
    queryKey: ['dashboard', dashboardId],
    queryFn: () => getDashboard(dashboardId),
    enabled: !!dashboardId,
  });

export const useCreateDashboard = () => {
  const qc = useQueryClient();
  return useMutation<Dashboard, Error, { name: string; project_id: string }>({
    mutationFn: createDashboard,
    onSuccess: (_data, { project_id }) => {
      qc.invalidateQueries({ queryKey: ['dashboards', project_id] });
    },
  });
};

export const useUpdateDashboard = () => {
  const qc = useQueryClient();
  return useMutation<Dashboard, Error, { id: string; data: Partial<Dashboard> }>({
    mutationFn: ({ id, data }) => updateDashboard(id, data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['dashboard', data.id] });
      qc.invalidateQueries({ queryKey: ['dashboards', data.project_id] });
    },
  });
};

export const useDeleteDashboard = () => {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string; projectId: string }>({
    mutationFn: ({ id }) => deleteDashboard(id),
    onSuccess: (_data, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['dashboards', projectId] });
    },
  });
};

export const useAddWidget = () => {
  const qc = useQueryClient();
  return useMutation<DashboardWidget, Error, { dashboardId: string; widget: Omit<DashboardWidget, 'id' | 'dashboard_id'> }>({
    mutationFn: ({ dashboardId, widget }) => addWidget(dashboardId, widget),
    onSuccess: (_data, { dashboardId }) => {
      qc.invalidateQueries({ queryKey: ['dashboard', dashboardId] });
    },
  });
};

export const useUpdateWidget = () => {
  const qc = useQueryClient();
  return useMutation<DashboardWidget, Error, { id: string; data: Partial<DashboardWidget> }>({
    mutationFn: ({ id, data }) => updateWidget(id, data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['dashboard', data.dashboard_id] });
    },
  });
};

export const useDeleteWidget = () => {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string; dashboardId: string }>({
    mutationFn: ({ id }) => deleteWidget(id),
    onSuccess: (_data, { dashboardId }) => {
      qc.invalidateQueries({ queryKey: ['dashboard', dashboardId] });
    },
  });
};

export const useWidgetData = (request: WidgetDataRequest, enabled = true) =>
  useQuery<{ data: Array<{ label: string; value: number }> }>({
    queryKey: ['widgetData', request],
    queryFn: () => getWidgetData(request),
    enabled: enabled && !!request.table_id,
    staleTime: 30000, // Cache for 30 seconds
  });
