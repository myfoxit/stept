// src/pages/DashboardPage.tsx
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DashboardGrid } from '@/components/Dashboard/DashboardGrid';
import { WidgetConfigDialog } from '@/components/Dashboard/WidgetConfigDialog';
import { useDashboards, useDashboard, useCreateDashboard, useDeleteDashboard } from '@/hooks/dashboard';
import { Plus, Trash, Edit2, Check, X } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useProjectContext } from '@/providers/project-provider';

export default function DashboardPage() {
  const { projectId: routeProjectId } = useParams();
  const { currentProject } = useProjectContext();
  const projectId = routeProjectId || currentProject?.id;
  
  const [selectedDashboardId, setSelectedDashboardId] = useState<string>('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [showAddWidget, setShowAddWidget] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newDashboardName, setNewDashboardName] = useState('');

  const { data: dashboards } = useDashboards(projectId || '');
  const { data: currentDashboard } = useDashboard(selectedDashboardId);
  const { mutate: createDashboard } = useCreateDashboard();
  const { mutate: deleteDashboard } = useDeleteDashboard();

  useEffect(() => {
    if (dashboards?.length && !selectedDashboardId) {
      setSelectedDashboardId(dashboards[0].id);
    }
  }, [dashboards, selectedDashboardId]);

  const handleCreateDashboard = () => {
    if (newDashboardName && projectId) {
      createDashboard(
        { name: newDashboardName, project_id: projectId },
        {
          onSuccess: (dashboard) => {
            setSelectedDashboardId(dashboard.id);
            setIsCreating(false);
            setNewDashboardName('');
          },
        }
      );
    }
  };

  const handleDeleteDashboard = () => {
    if (currentDashboard && confirm(`Delete dashboard "${currentDashboard.name}"?`)) {
      deleteDashboard(
        { id: currentDashboard.id, projectId: projectId || '' },
        {
          onSuccess: () => {
            setSelectedDashboardId('');
          },
        }
      );
    }
  };

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-[400px] text-muted-foreground">
        <div className="text-center">
          <p>Please select a project to view dashboards</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          
          {!isCreating ? (
            <div className="flex items-center gap-2">
              <Select value={selectedDashboardId} onValueChange={setSelectedDashboardId}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select dashboard" />
                </SelectTrigger>
                <SelectContent>
                  {dashboards?.map((dashboard) => (
                    <SelectItem key={dashboard.id} value={dashboard.id}>
                      {dashboard.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Button variant="outline" size="icon" onClick={() => setIsCreating(true)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                value={newDashboardName}
                onChange={(e) => setNewDashboardName(e.target.value)}
                placeholder="Dashboard name"
                className="w-[200px]"
                onKeyPress={(e) => e.key === 'Enter' && handleCreateDashboard()}
              />
              <Button size="icon" onClick={handleCreateDashboard}>
                <Check className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => setIsCreating(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {currentDashboard && (
          <div className="flex items-center gap-2">
            <Button
              variant={isEditMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => setIsEditMode(!isEditMode)}
            >
              <Edit2 className="h-4 w-4 mr-2" />
              {isEditMode ? 'Done' : 'Edit'}
            </Button>
            
            {isEditMode && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddWidget(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Widget
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDeleteDashboard}
                >
                  <Trash className="h-4 w-4 mr-2" />
                  Delete Dashboard
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {currentDashboard ? (
        <DashboardGrid
          widgets={currentDashboard.widgets}
          dashboardId={currentDashboard.id}
          isEditMode={isEditMode}
        />
      ) : (
        <div className="flex items-center justify-center h-[400px] text-muted-foreground">
          {dashboards?.length === 0 ? (
            <div className="text-center">
              <p>No dashboards yet</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setIsCreating(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Dashboard
              </Button>
            </div>
          ) : (
            'Select a dashboard'
          )}
        </div>
      )}

      {showAddWidget && currentDashboard && (
        <WidgetConfigDialog
          dashboardId={currentDashboard.id}
          projectId={projectId}
          onClose={() => setShowAddWidget(false)}
        />
      )}
    </div>
  );
}
