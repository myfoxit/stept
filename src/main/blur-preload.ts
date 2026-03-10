import { contextBridge, ipcRenderer } from 'electron';

/**
 * Minimal preload for the blur overlay window.
 * Only exposes the IPC methods needed for region management.
 */
contextBridge.exposeInMainWorld('blurAPI', {
  /** Send updated regions back to main process */
  updateRegions: (regions: Array<{ id: string; x: number; y: number; width: number; height: number }>) => {
    ipcRenderer.send('blur:regions-updated', regions);
  },
  /** Notify main process that user pressed Escape (deactivate blur mode) */
  requestDeactivate: () => {
    ipcRenderer.send('blur:request-deactivate');
  },
});
