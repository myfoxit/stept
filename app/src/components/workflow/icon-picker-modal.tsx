import * as React from 'react';
import * as TablerIcons from '@tabler/icons-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface IconPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (type: 'tabler' | 'favicon', value: string, color?: string) => void;
  currentIcon?: { type: string; value: string; color?: string };
}

// Popular Tabler icons for workflows
const POPULAR_ICONS = [
  'IconPencil', 'IconChecklist', 'IconSettings', 'IconDatabase',
  'IconChart', 'IconFolder', 'IconFile', 'IconCode', 'IconBrandChrome',
  'IconClick', 'IconMouse', 'IconKeyboard', 'IconScreenshot',
  'IconCamera', 'IconVideo', 'IconMail', 'IconBell', 'IconCalendar',
  'IconClock', 'IconDownload', 'IconUpload', 'IconShare', 'IconLink',
];

const COLORS = [
  '#D94F3D', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#0ea5e9', '#3b82f6', '#D94F3D', '#8b5cf6',
];

export function IconPickerModal({
  open,
  onClose,
  onSelect,
  currentIcon,
}: IconPickerModalProps) {
  const [selectedTab, setSelectedTab] = React.useState<'tabler' | 'favicon'>(currentIcon?.type === 'favicon' ? 'favicon' : 'tabler');
  const [selectedIcon, setSelectedIcon] = React.useState(currentIcon?.value || 'IconPencil');
  const [selectedColor, setSelectedColor] = React.useState(currentIcon?.color || '#D94F3D');
  const [faviconUrl, setFaviconUrl] = React.useState('');

  // NEW: Sync state when modal opens / currentIcon changes
  React.useEffect(() => {
    if (!open) return;
    const type = (currentIcon?.type === 'favicon' ? 'favicon' : 'tabler') as 'tabler' | 'favicon';
    setSelectedTab(type);
    setSelectedIcon(currentIcon?.value || 'IconPencil');
    setSelectedColor(currentIcon?.color || '#D94F3D');

    if (type === 'favicon') {
      // Try to derive hostname for preview if value is a full URL (e.g., google s2 endpoint)
      try {
        const val = currentIcon?.value || '';
        const url = new URL(val);
        const host = url.searchParams.get('domain') || url.hostname;
        if (host) setFaviconUrl(host);
      } catch {
        // If not a URL, treat value as hostname
        if (currentIcon?.value) setFaviconUrl(currentIcon.value);
      }
    } else {
      setFaviconUrl('');
    }
  }, [open, currentIcon]);

  const [searchQuery, setSearchQuery] = React.useState('');

  const handleTablerSelect = () => {
    onSelect('tabler', selectedIcon, selectedColor);
    onClose();
  };

  const handleFaviconSelect = () => {
    if (!faviconUrl) return;
    
    // Extract domain and get favicon
    try {
      const url = new URL(faviconUrl.startsWith('http') ? faviconUrl : `https://${faviconUrl}`);
      const faviconPath = `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=64`;
      onSelect('favicon', faviconPath);
      onClose();
    } catch {
      alert('Please enter a valid URL');
    }
  };

  const filteredIcons = React.useMemo(() => {
    if (!searchQuery) return POPULAR_ICONS;
    return Object.keys(TablerIcons)
      .filter(name => name.startsWith('Icon') && name.toLowerCase().includes(searchQuery.toLowerCase()))
      .slice(0, 24);
  }, [searchQuery]);

  const IconComponent = (TablerIcons as any)[selectedIcon] || TablerIcons.IconPencil;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Choose an icon</DialogTitle>
        </DialogHeader>

        <Tabs value={selectedTab} onValueChange={(v) => setSelectedTab(v as 'tabler' | 'favicon')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="tabler">Icon Library</TabsTrigger>
            <TabsTrigger value="favicon">Website Favicon</TabsTrigger>
          </TabsList>

          <TabsContent value="tabler" className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-xl" style={{ backgroundColor: selectedColor }}>
                <IconComponent className="h-8 w-8 text-white" />
              </div>
              <div className="flex-1 space-y-2">
                <Input
                  placeholder="Search icons..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <div className="flex gap-1">
                  {COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setSelectedColor(color)}
                      className={cn(
                        "h-6 w-6 rounded-md border-2",
                        selectedColor === color ? "border-gray-900" : "border-transparent"
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-6 gap-2">
              {filteredIcons.map((iconName) => {
                const Icon = (TablerIcons as any)[iconName];
                if (!Icon) return null;
                return (
                  <button
                    key={iconName}
                    onClick={() => setSelectedIcon(iconName)}
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg border-2",
                      selectedIcon === iconName
                        ? "border-primary bg-primary/5"
                        : "border-transparent hover:bg-gray-100"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleTablerSelect}>
                Use This Icon
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="favicon" className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Website URL</label>
              <Input
                placeholder="e.g., google.com or https://example.com"
                value={faviconUrl}
                onChange={(e) => setFaviconUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleFaviconSelect()}
              />
              <p className="text-xs text-muted-foreground">
                Enter a website URL to use its favicon as the icon
              </p>
            </div>

            {faviconUrl && (
              <div className="flex items-center gap-4">
                <img
                  src={`https://www.google.com/s2/favicons?domain=${faviconUrl}&sz=64`}
                  alt="Favicon preview"
                  className="h-16 w-16 rounded-lg border"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"%3E%3Cpath d="M12 2a10 10 0 1010 10A10 10 0 0012 2zm0 18a8 8 0 118-8 8 8 0 01-8 8z" fill="%23999"/%3E%3C/svg%3E';
                  }}
                />
                <div className="text-sm text-muted-foreground">
                  Preview of the favicon
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleFaviconSelect} disabled={!faviconUrl}>
                Use This Favicon
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
