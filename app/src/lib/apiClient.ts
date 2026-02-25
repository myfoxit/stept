import type { HTTPValidationError } from '@/types/openapi';
import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from 'axios';

// NEW: Export a function to get the API base URL consistently
export const getApiBaseUrl = (): string => {
  const url = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '/api/v1';
  // Debug: log the resolved URL (remove in production)
  if (import.meta.env.DEV) {
    console.log('[API] Base URL:', url, {
      VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
      VITE_API_URL: import.meta.env.VITE_API_URL,
    });
  }
  return url;
};

export const apiClient: AxiosInstance = axios.create({
  baseURL: getApiBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  // Cookie-based auth: no Authorization header needed
  return config;
});

apiClient.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    console.error('[API error]', error);

    if (error.response?.status === 401) {
      const unauthorizedError = new Error('UNAUTHORIZED');
      return Promise.reject(unauthorizedError);
    }

    return Promise.reject(error);
  }
);

export async function request<TRes, TBody = unknown>(
  config: AxiosRequestConfig<TBody>
): Promise<TRes> {
  const { data } = await apiClient.request<TRes, AxiosResponse<TRes>, TBody>(
    config
  );
  return data;
}

export type ApiError = AxiosError<HTTPValidationError | { detail?: string }>;
