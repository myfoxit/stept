import { useQuery } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/apiClient';

export interface FeatureFlags {
  video_import: boolean;
  knowledge_base: boolean;
  ai_chat: boolean;
  mcp: boolean;
}

const defaultFlags: FeatureFlags = {
  video_import: false,
  knowledge_base: false,
  ai_chat: false,
  mcp: false,
};

export function useFeatures(): FeatureFlags {
  const { data } = useQuery<FeatureFlags>({
    queryKey: ['features'],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/features`);
      if (!res.ok) return defaultFlags;
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return data ?? defaultFlags;
}
