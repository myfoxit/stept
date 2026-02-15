import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { SpotlightSearch } from './SpotlightSearch';

interface SpotlightContextValue {
  isOpen: boolean;
  openSpotlight: () => void;
  closeSpotlight: () => void;
}

const SpotlightContext = createContext<SpotlightContextValue>({
  isOpen: false,
  openSpotlight: () => {},
  closeSpotlight: () => {},
});

export function useSpotlight() {
  return useContext(SpotlightContext);
}

export function SpotlightProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const openSpotlight = useCallback(() => setIsOpen(true), []);
  const closeSpotlight = useCallback(() => setIsOpen(false), []);

  // Global Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <SpotlightContext.Provider value={{ isOpen, openSpotlight, closeSpotlight }}>
      {children}
      <SpotlightSearch open={isOpen} onOpenChange={setIsOpen} />
    </SpotlightContext.Provider>
  );
}
