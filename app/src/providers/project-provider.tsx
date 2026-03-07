import React, { useContext } from 'react';

import { useAuth } from '@/providers/auth-provider';
import { useProjects, useProjectRole, useCreateProject, useDeleteProject, useUpdateProject } from '@/hooks/api/projects';

export interface Project {
  id: string;
  name: string;
  created_by_name?: string;
  ai_enabled?: boolean;
}

export type ProjectRole = 'owner' | 'admin' | 'editor' | 'viewer' | null;

interface ProjectContextValue {
  projects: Project[];
  isLoading: boolean;
  error: unknown;
  selectedProjectId: string | null;
  selectedProject: Project | null;
  userRole: ProjectRole;
  setSelectedProjectId: (id: string | null) => void;  // Allow null
  createProject: (name: string) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
  renameProject: (id: string, name: string) => Promise<Project>;
}

const PROJECT_STORAGE_KEY = 'selectedProjectId';

const ProjectContext = React.createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { data: projects = [], isLoading, error } = useProjects(user?.id || '');
  
  // State for selected project
  const [selectedProjectId, setSelectedProjectIdState] = React.useState<string | null>(null);
  const [hasInitialized, setHasInitialized] = React.useState(false);

  // Fetch user's role in the selected project
  const { data: userRole = null } = useProjectRole(
    selectedProjectId || '',
    user?.id || ''
  );

  // Get mutation hooks
  const createProjectMutation = useCreateProject();
  const deleteProjectMutation = useDeleteProject();
  const updateProjectMutation = useUpdateProject();

  // Initialize from localStorage and validate against fetched projects
  React.useEffect(() => {
    // Skip if already initialized or still loading
    if (hasInitialized || isLoading || !user?.id) {
      return;
    }

    // Only run when we have projects loaded
    if (projects.length === 0) {
      setHasInitialized(true);
      return;
    }

    // Try to restore from localStorage
    const storedId = localStorage.getItem(`${PROJECT_STORAGE_KEY}_${user.id}`);
    
    if (storedId && projects.some(p => p.id === storedId)) {
      // Stored project exists, use it
      setSelectedProjectIdState(storedId);
    } else {
      // No valid stored project, select first one
      setSelectedProjectIdState(projects[0].id);
    }
    
    setHasInitialized(true);
  }, [isLoading, projects, user?.id, hasInitialized]);

  // Wrapper to persist to localStorage
  const setSelectedProjectId = React.useCallback((id: string | null) => {
    setSelectedProjectIdState(id);
    
    if (!user?.id) return;
    
    const key = `${PROJECT_STORAGE_KEY}_${user.id}`;
    if (id) {
      localStorage.setItem(key, id);
    } else {
      localStorage.removeItem(key);
    }
  }, [user?.id]);

  // Reset initialization when user changes
  React.useEffect(() => {
    if (!user?.id) {
      setSelectedProjectIdState(null);
      setHasInitialized(false);
    }
  }, [user?.id]);

  const selectedProject = React.useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );

  // Create project using the mutation hook
  async function createProject(name: string): Promise<Project> {
    const newProject = await createProjectMutation.mutateAsync({
      name,
      user_id: user?.id || '',
    });
    setSelectedProjectId(newProject.id);
    return newProject;
  }

  // Delete project using the mutation hook
  async function deleteProject(id: string): Promise<void> {
    await deleteProjectMutation.mutateAsync(id);
    // If the deleted project was selected, clear selection or select another
    if (selectedProjectId === id) {
      const remainingProjects = projects.filter((p) => p.id !== id);
      setSelectedProjectId(remainingProjects[0]?.id || null);
    }
  }

  // Rename project using the mutation hook
  async function renameProject(id: string, name: string): Promise<Project> {
    const updatedProject = await updateProjectMutation.mutateAsync({
      projectId: id,
      name,
    });
    return updatedProject;
  }

  return (
    <ProjectContext.Provider
      value={{
        projects,
        isLoading,
        error,
        selectedProjectId,
        selectedProject,
        userRole,
        setSelectedProjectId,
        createProject,
        deleteProject,
        renameProject,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = React.useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used within ProjectProvider');
  return ctx;
}

// Add this export at the end if it doesn't exist
export const useProjectContext = () => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProjectContext must be used within ProjectProvider');
  }
  return context;
};
    