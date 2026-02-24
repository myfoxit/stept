import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Sun, MoonStar } from 'lucide-react';

export function ThemeToggle() {
  const [isDarkMode, setIsDarkMode] = React.useState<boolean>(false);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => setIsDarkMode(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  React.useEffect(() => {
    const initialDarkMode =
      !!document.querySelector('meta[name="color-scheme"][content="dark"]') ||
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    setIsDarkMode(initialDarkMode);
  }, []);

  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setIsDarkMode((d) => !d)}
      aria-label={`Switch to ${isDarkMode ? 'light' : 'dark'} mode`}
    >
      {isDarkMode ? <MoonStar className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </Button>
  );
}
