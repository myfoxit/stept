import { useEffect, useState } from 'react';
import { ElectronAPI } from '../../main/preload';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    platform: NodeJS.Platform;
    versions: NodeJS.ProcessVersions;
  }
}

/**
 * Custom hook to access the Electron API with type safety
 * @returns Typed wrapper for window.electronAPI
 */
export const useElectronAPI = () => {
  const [isAvailable, setIsAvailable] = useState(false);

  useEffect(() => {
    // Check if Electron API is available
    if (typeof window !== 'undefined' && window.electronAPI) {
      setIsAvailable(true);
    }
  }, []);

  // Return null if API is not available (e.g., running in browser)
  if (!isAvailable || !window.electronAPI) {
    console.warn('Electron API not available');
    return null;
  }

  return window.electronAPI;
};

/**
 * Hook to get platform information
 * @returns Platform and version information
 */
export const usePlatformInfo = () => {
  const [platformInfo, setPlatformInfo] = useState<{
    platform: NodeJS.Platform | null;
    versions: NodeJS.ProcessVersions | null;
    appVersion: string | null;
  }>({
    platform: null,
    versions: null,
    appVersion: null,
  });

  const electronAPI = useElectronAPI();

  useEffect(() => {
    const loadPlatformInfo = async () => {
      if (!electronAPI) return;

      try {
        const [appVersion, platform] = await Promise.all([
          electronAPI.getAppVersion(),
          electronAPI.getPlatform(),
        ]);

        setPlatformInfo({
          platform: platform as NodeJS.Platform,
          versions: window.versions || null,
          appVersion,
        });
      } catch (error) {
        console.error('Failed to load platform info:', error);
      }
    };

    loadPlatformInfo();
  }, [electronAPI]);

  return platformInfo;
};

export default useElectronAPI;