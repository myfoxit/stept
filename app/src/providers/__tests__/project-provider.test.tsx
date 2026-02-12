import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock auth provider
const mockUser = { id: 'u1', email: 'test@test.com', name: 'Test' };
jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ user: mockUser, loading: false }),
}));

// Mock project API hooks
let mockProjects: any[] = [];
let mockIsLoading = false;
let mockError: any = null;
let mockUserRole: string | null = 'owner';
const mockMutateAsyncCreate = jest.fn();
const mockMutateAsyncDelete = jest.fn();
const mockMutateAsyncUpdate = jest.fn();

jest.mock('@/hooks/api/projects', () => ({
  useProjects: () => ({
    data: mockProjects,
    isLoading: mockIsLoading,
    error: mockError,
  }),
  useProjectRole: () => ({
    data: mockUserRole,
  }),
  useCreateProject: () => ({
    mutateAsync: mockMutateAsyncCreate,
  }),
  useDeleteProject: () => ({
    mutateAsync: mockMutateAsyncDelete,
  }),
  useUpdateProject: () => ({
    mutateAsync: mockMutateAsyncUpdate,
  }),
}));

// Mock localStorage
const localStorageMock: Record<string, string> = {};
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: jest.fn((key: string) => localStorageMock[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      localStorageMock[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete localStorageMock[key];
    }),
    clear: jest.fn(() => {
      Object.keys(localStorageMock).forEach((key) => delete localStorageMock[key]);
    }),
  },
});

import { ProjectProvider, useProject } from '@/providers/project-provider';

function TestConsumer() {
  const {
    projects,
    isLoading,
    selectedProject,
    selectedProjectId,
    userRole,
    setSelectedProjectId,
    createProject,
  } = useProject();

  return (
    <div>
      <div data-testid="loading">{isLoading ? 'loading' : 'ready'}</div>
      <div data-testid="project-count">{projects.length}</div>
      <div data-testid="selected">{selectedProject?.name || 'none'}</div>
      <div data-testid="selected-id">{selectedProjectId || 'null'}</div>
      <div data-testid="role">{userRole || 'no-role'}</div>
      <button onClick={() => setSelectedProjectId('proj-2')}>Select Proj 2</button>
      <button onClick={() => createProject('New Project')}>Create</button>
    </div>
  );
}

describe('ProjectProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProjects = [
      { id: 'proj-1', name: 'Project A' },
      { id: 'proj-2', name: 'Project B' },
    ];
    mockIsLoading = false;
    mockError = null;
    mockUserRole = 'owner';
    Object.keys(localStorageMock).forEach((key) => delete localStorageMock[key]);
  });

  it('lists projects on mount', async () => {
    render(
      <ProjectProvider>
        <TestConsumer />
      </ProjectProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('project-count').textContent).toBe('2');
    });
  });

  it('selects first project by default', async () => {
    render(
      <ProjectProvider>
        <TestConsumer />
      </ProjectProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('selected').textContent).toBe('Project A');
    });
  });

  it('allows selecting a different project', async () => {
    render(
      <ProjectProvider>
        <TestConsumer />
      </ProjectProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('selected').textContent).toBe('Project A');
    });

    await act(async () => {
      screen.getByText('Select Proj 2').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('selected').textContent).toBe('Project B');
    });
  });

  it('creates a project', async () => {
    const newProject = { id: 'proj-3', name: 'New Project' };
    mockMutateAsyncCreate.mockResolvedValueOnce(newProject);

    render(
      <ProjectProvider>
        <TestConsumer />
      </ProjectProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('ready');
    });

    await act(async () => {
      screen.getByText('Create').click();
    });

    expect(mockMutateAsyncCreate).toHaveBeenCalledWith({
      name: 'New Project',
      user_id: 'u1',
    });
  });

  it('shows loading state', () => {
    mockIsLoading = true;
    mockProjects = [];

    render(
      <ProjectProvider>
        <TestConsumer />
      </ProjectProvider>
    );

    expect(screen.getByTestId('loading').textContent).toBe('loading');
  });

  it('displays user role', async () => {
    render(
      <ProjectProvider>
        <TestConsumer />
      </ProjectProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('role').textContent).toBe('owner');
    });
  });

  it('throws when useProject is used outside provider', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<TestConsumer />);
    }).toThrow('useProject must be used within ProjectProvider');

    jest.restoreAllMocks();
  });
});
