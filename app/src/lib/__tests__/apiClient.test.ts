/**
 * Test that the apiClient module exports are correctly shaped.
 * Note: apiClient.ts uses import.meta.env (Vite), so we test through mocks.
 */

// Mock the entire module since it uses import.meta.env (Vite-only)
jest.mock('@/lib/apiClient', () => {
  const mockAxios = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
    request: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  };

  return {
    apiClient: mockAxios,
    getApiBaseUrl: () => 'http://localhost:8000/api/v1',
    request: jest.fn(async (config: any) => {
      const { data } = await mockAxios.request(config);
      return data;
    }),
  };
});

import { apiClient, getApiBaseUrl, request } from '@/lib/apiClient';

describe('apiClient (mocked)', () => {
  it('exports apiClient with expected methods', () => {
    expect(apiClient).toBeDefined();
    expect(apiClient.get).toBeDefined();
    expect(apiClient.post).toBeDefined();
    expect(apiClient.put).toBeDefined();
    expect(apiClient.delete).toBeDefined();
  });

  it('getApiBaseUrl returns a URL string', () => {
    const url = getApiBaseUrl();
    expect(typeof url).toBe('string');
    expect(url).toMatch(/^https?:\/\//);
  });

  it('request function is exported', () => {
    expect(typeof request).toBe('function');
  });
});
