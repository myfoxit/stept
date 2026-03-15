import { useSyncExternalStore } from 'react';

type ActiveCell = { row: number; col: number } | null;
type Listener = () => void;

class ActiveCellStore {
  private activeCell: ActiveCell = null;
  private listeners = new Set<Listener>();

  getSnapshot = () => this.activeCell;
  getState = () => this.activeCell;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setActiveCell = (cell: ActiveCell) => {
    if (
      this.activeCell?.row === cell?.row &&
      this.activeCell?.col === cell?.col
    ) {
      return;
    }
    this.activeCell = cell;
    this.listeners.forEach(listener => listener());
  };
}

const store = new ActiveCellStore();

export const setActiveCellStore = store.setActiveCell;
export const getActiveCellStore = store.getState;
export const useActiveCellStore = () =>
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
