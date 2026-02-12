import { apiClient } from '@/lib/apiClient';
import * as authApi from '../auth';

jest.mock('@/lib/apiClient', () => ({
  apiClient: {
    request: jest.fn(),
  },
  request: jest.fn(),
}));

// Since auth.ts uses the `request` helper directly, we mock it
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

describe('Auth API', () => {
  afterEach(() => jest.clearAllMocks());

  describe('login', () => {
    it('calls POST /auth/login with credentials', async () => {
      const token = { access_token: 'jwt-token', token_type: 'bearer' };
      mockRequest.mockResolvedValueOnce(token);

      const result = await authApi.login({ email: 'user@test.com', password: 'pass123' });

      expect(mockRequest).toHaveBeenCalledWith({
        method: 'POST',
        url: '/auth/login',
        data: { email: 'user@test.com', password: 'pass123' },
        withCredentials: true,
      });
      expect(result).toEqual(token);
    });
  });

  describe('register', () => {
    it('calls POST /auth/register', async () => {
      const token = { access_token: 'new-token', token_type: 'bearer' };
      mockRequest.mockResolvedValueOnce(token);

      const body = { email: 'new@test.com', password: 'securepass', name: 'Test' };
      const result = await authApi.register(body as any);

      expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining({
        method: 'POST',
        url: '/auth/register',
        withCredentials: true,
      }));
      expect(result).toEqual(token);
    });
  });

  describe('me', () => {
    it('calls GET /auth/me', async () => {
      const user = { id: '1', email: 'user@test.com', name: 'Test' };
      mockRequest.mockResolvedValueOnce(user);

      const result = await authApi.me();
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'GET',
        url: '/auth/me',
        withCredentials: true,
      });
      expect(result).toEqual(user);
    });
  });

  describe('logout', () => {
    it('calls POST /auth/logout', async () => {
      mockRequest.mockResolvedValueOnce(undefined);

      await authApi.logout();
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'POST',
        url: '/auth/logout',
        withCredentials: true,
      });
    });
  });

  describe('refreshToken', () => {
    it('calls POST /auth/refresh', async () => {
      mockRequest.mockResolvedValueOnce({ access_token: 'refreshed' });

      const result = await authApi.refreshToken();
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'POST',
        url: '/auth/refresh',
        withCredentials: true,
      });
    });
  });
});
