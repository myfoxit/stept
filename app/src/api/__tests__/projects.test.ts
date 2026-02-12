import * as projectsApi from '../projects';

jest.mock('@/lib/apiClient', () => {
  const mockRequest = jest.fn();
  return {
    apiClient: { request: jest.fn() },
    request: mockRequest,
    getApiBaseUrl: () => 'http://localhost:8000/api/v1',
  };
});

import { request } from '@/lib/apiClient';
const mockRequest = request as jest.MockedFunction<typeof request>;

describe('Projects API', () => {
  afterEach(() => jest.clearAllMocks());

  describe('listProjects', () => {
    it('calls GET /projects/{userId}', async () => {
      const projects = [
        { id: '1', name: 'Project A', owner_id: 'u1' },
        { id: '2', name: 'Project B', owner_id: 'u1' },
      ];
      mockRequest.mockResolvedValueOnce(projects);

      const result = await projectsApi.listProjects('u1');
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'GET',
        url: '/projects/u1',
      });
      expect(result).toEqual(projects);
    });
  });

  describe('createProject', () => {
    it('calls POST /projects/', async () => {
      const newProject = { id: '3', name: 'New Project', owner_id: 'u1' };
      mockRequest.mockResolvedValueOnce(newProject);

      const result = await projectsApi.createProject({
        name: 'New Project',
        user_id: 'u1',
      });
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'POST',
        url: '/projects/',
        data: { name: 'New Project', user_id: 'u1' },
      });
      expect(result).toEqual(newProject);
    });
  });

  describe('deleteProject', () => {
    it('calls DELETE /projects/{projectId}', async () => {
      mockRequest.mockResolvedValueOnce(undefined);

      await projectsApi.deleteProject('proj-1');
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'DELETE',
        url: '/projects/proj-1',
      });
    });
  });

  describe('updateProject', () => {
    it('calls PUT /projects/{projectId}', async () => {
      const updated = { id: 'proj-1', name: 'Renamed', owner_id: 'u1' };
      mockRequest.mockResolvedValueOnce(updated);

      const result = await projectsApi.updateProject('proj-1', 'Renamed');
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'PUT',
        url: '/projects/proj-1',
        data: { name: 'Renamed' },
      });
      expect(result).toEqual(updated);
    });
  });

  describe('addProjectMember', () => {
    it('calls POST /projects/{id}/members with default role', async () => {
      mockRequest.mockResolvedValueOnce({ status: 'added' });

      const result = await projectsApi.addProjectMember('proj-1', 'user-2');
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'POST',
        url: '/projects/proj-1/members',
        data: { user_id: 'user-2', role: 'member' },
      });
      expect(result.status).toBe('added');
    });

    it('supports custom role', async () => {
      mockRequest.mockResolvedValueOnce({ status: 'added' });

      await projectsApi.addProjectMember('proj-1', 'user-2', 'admin');
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'POST',
        url: '/projects/proj-1/members',
        data: { user_id: 'user-2', role: 'admin' },
      });
    });
  });

  describe('removeProjectMember', () => {
    it('calls DELETE /projects/{id}/members/{userId}', async () => {
      mockRequest.mockResolvedValueOnce({ status: 'removed' });

      const result = await projectsApi.removeProjectMember('proj-1', 'user-2');
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'DELETE',
        url: '/projects/proj-1/members/user-2',
      });
      expect(result.status).toBe('removed');
    });
  });

  describe('updateMemberRole', () => {
    it('calls PUT /projects/{id}/members/{userId}', async () => {
      mockRequest.mockResolvedValueOnce({ status: 'updated' });

      const result = await projectsApi.updateMemberRole('proj-1', 'user-2', 'admin');
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'PUT',
        url: '/projects/proj-1/members/user-2',
        data: { role: 'admin' },
      });
      expect(result.status).toBe('updated');
    });
  });

  describe('getProjectMembers', () => {
    it('calls GET /projects/{id}/members', async () => {
      const members = [
        { user_id: 'u1', role: 'owner', joined_at: '2024-01-01' },
        { user_id: 'u2', role: 'member', joined_at: '2024-01-02' },
      ];
      mockRequest.mockResolvedValueOnce(members);

      const result = await projectsApi.getProjectMembers('proj-1');
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'GET',
        url: '/projects/proj-1/members',
      });
      expect(result).toEqual(members);
    });
  });

  describe('getUserRole', () => {
    it('calls GET /projects/{id}/role', async () => {
      mockRequest.mockResolvedValueOnce({ role: 'owner' });

      const result = await projectsApi.getUserRole('proj-1');
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'GET',
        url: '/projects/proj-1/role',
      });
      expect(result.role).toBe('owner');
    });

    it('returns null role for non-members', async () => {
      mockRequest.mockResolvedValueOnce({ role: null });

      const result = await projectsApi.getUserRole('proj-1');
      expect(result.role).toBeNull();
    });
  });
});
