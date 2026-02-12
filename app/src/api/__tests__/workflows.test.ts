import * as workflowsApi from '../workflows';

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

describe('Workflows API', () => {
  afterEach(() => jest.clearAllMocks());

  describe('getWorkflow', () => {
    it('calls GET /process-recording/session/{id}/status', async () => {
      const workflow = { session_id: 'wf-1', status: 'completed', total_steps: 5 };
      mockRequest.mockResolvedValueOnce(workflow);

      const result = await workflowsApi.getWorkflow('wf-1');
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'GET',
        url: '/process-recording/session/wf-1/status',
      });
      expect(result).toEqual(workflow);
    });
  });

  describe('listWorkflows', () => {
    it('calls GET /process-recording/sessions with defaults', async () => {
      const workflows = [{ session_id: 'wf-1' }, { session_id: 'wf-2' }];
      mockRequest.mockResolvedValueOnce(workflows);

      const result = await workflowsApi.listWorkflows();
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'GET',
        url: '/process-recording/sessions?limit=20&offset=0',
      });
      expect(result).toEqual(workflows);
    });

    it('passes custom limit and offset', async () => {
      mockRequest.mockResolvedValueOnce([]);

      await workflowsApi.listWorkflows(10, 5);
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'GET',
        url: '/process-recording/sessions?limit=10&offset=5',
      });
    });
  });

  describe('updateWorkflow', () => {
    it('calls PUT /process-recording/workflow/{id}', async () => {
      const updated = { id: 'wf-1', name: 'Renamed' };
      mockRequest.mockResolvedValueOnce(updated);

      const result = await workflowsApi.updateWorkflow('wf-1', { name: 'Renamed' });
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'PUT',
        url: '/process-recording/workflow/wf-1',
        data: { name: 'Renamed' },
      });
      expect(result).toEqual(updated);
    });

    it('supports icon fields', async () => {
      mockRequest.mockResolvedValueOnce({ id: 'wf-1' });

      await workflowsApi.updateWorkflow('wf-1', {
        icon_type: 'tabler',
        icon_value: 'IconRocket',
        icon_color: '#ff0000',
      });
      expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          icon_type: 'tabler',
          icon_value: 'IconRocket',
          icon_color: '#ff0000',
        }),
      }));
    });
  });

  describe('moveWorkflow', () => {
    it('calls PUT /process-recording/workflow/{id}/move', async () => {
      mockRequest.mockResolvedValueOnce({ id: 'wf-1' });

      await workflowsApi.moveWorkflow('wf-1', { folder_id: 'folder-1', position: 0 });
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'PUT',
        url: '/process-recording/workflow/wf-1/move',
        data: { folder_id: 'folder-1', position: 0 },
      });
    });

    it('supports moving to root (null folder)', async () => {
      mockRequest.mockResolvedValueOnce({ id: 'wf-1' });

      await workflowsApi.moveWorkflow('wf-1', { folder_id: null });
      expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining({
        data: { folder_id: null },
      }));
    });
  });

  describe('deleteWorkflow', () => {
    it('calls DELETE /process-recording/workflow/{id}', async () => {
      mockRequest.mockResolvedValueOnce(undefined);

      await workflowsApi.deleteWorkflow('wf-1');
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'DELETE',
        url: '/process-recording/workflow/wf-1',
      });
    });
  });

  describe('duplicateWorkflow', () => {
    it('calls POST /process-recording/workflow/{id}/duplicate', async () => {
      const dup = { id: 'wf-copy' };
      mockRequest.mockResolvedValueOnce(dup);

      const result = await workflowsApi.duplicateWorkflow('wf-1');
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'POST',
        url: '/process-recording/workflow/wf-1/duplicate',
      });
      expect(result).toEqual(dup);
    });
  });

  describe('createStep', () => {
    it('calls POST /process-recording/session/{id}/steps', async () => {
      const step = { id: 'step-1', step_number: 1, step_type: 'text' };
      mockRequest.mockResolvedValueOnce(step);

      const result = await workflowsApi.createStep('wf-1', 1, {
        step_type: 'text',
        description: 'Manual step',
        content: 'Do this',
      });
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'POST',
        url: '/process-recording/session/wf-1/steps?position=1',
        data: { step_type: 'text', description: 'Manual step', content: 'Do this' },
      });
      expect(result).toEqual(step);
    });
  });

  describe('updateStep', () => {
    it('calls PUT /process-recording/session/{id}/steps/{stepNumber}', async () => {
      const updated = { id: 'step-1', description: 'Updated' };
      mockRequest.mockResolvedValueOnce(updated);

      const result = await workflowsApi.updateStep('wf-1', 1, {
        description: 'Updated',
      });
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'PUT',
        url: '/process-recording/session/wf-1/steps/1',
        data: { description: 'Updated' },
      });
      expect(result).toEqual(updated);
    });
  });

  describe('deleteStep', () => {
    it('calls DELETE /process-recording/session/{id}/steps/{stepNumber}', async () => {
      mockRequest.mockResolvedValueOnce({ status: 'success' });

      await workflowsApi.deleteStep('wf-1', 2);
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'DELETE',
        url: '/process-recording/session/wf-1/steps/2',
      });
    });
  });

  describe('reorderSteps', () => {
    it('calls POST /process-recording/session/{id}/steps/reorder', async () => {
      mockRequest.mockResolvedValueOnce({ status: 'success' });

      await workflowsApi.reorderSteps('wf-1', [
        { step_number: 1, new_position: 3 },
        { step_number: 3, new_position: 1 },
      ]);
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'POST',
        url: '/process-recording/session/wf-1/steps/reorder',
        data: {
          reorders: [
            { step_number: 1, new_position: 3 },
            { step_number: 3, new_position: 1 },
          ],
        },
      });
    });
  });

  describe('getFilteredWorkflows', () => {
    it('calls GET /process-recording/workflows/filtered with params', async () => {
      mockRequest.mockResolvedValueOnce([]);

      await workflowsApi.getFilteredWorkflows('proj-1');
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'GET',
        url: '/process-recording/workflows/filtered',
        params: {
          project_id: 'proj-1',
          folder_id: undefined,
          sort_by: 'created_at',
          sort_order: 'desc',
          skip: 0,
          limit: 100,
        },
      });
    });

    it('passes folder_id and custom sort', async () => {
      mockRequest.mockResolvedValueOnce([]);

      await workflowsApi.getFilteredWorkflows('proj-1', 'folder-1', 'name', 'asc', 10, 50);
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'GET',
        url: '/process-recording/workflows/filtered',
        params: {
          project_id: 'proj-1',
          folder_id: 'folder-1',
          sort_by: 'name',
          sort_order: 'asc',
          skip: 10,
          limit: 50,
        },
      });
    });
  });
});
