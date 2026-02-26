import { useState, useEffect, useRef } from 'react';
import {
  IconLink,
  IconPlus,
  IconX,
  IconWorld,
  IconDeviceDesktop,
  IconChevronDown,
  IconSearch,
  IconRegex,
  IconWindowMaximize,
  IconApps,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  listContextLinks,
  createContextLink,
  deleteContextLink,
  type ContextLink,
} from '@/api/context-links';
import { useProject } from '@/providers/project-provider';
import { apiClient } from '@/lib/apiClient';

interface ContextLinkPanelProps {
  projectId: string;
  resourceType: 'workflow' | 'document';
  resourceId: string;
}

const MATCH_ICONS: Record<string, typeof IconWorld> = {
  url_pattern: IconWorld,
  url_exact: IconWorld,
  url_regex: IconRegex,
  app_name: IconApps,
  app_exact: IconDeviceDesktop,
  app_regex: IconRegex,
  window_title: IconWindowMaximize,
  window_regex: IconRegex,
};

const PLACEHOLDERS: Record<string, string> = {
  url_pattern: '*.salesforce.com/*',
  url_exact: 'https://app.example.com/dashboard',
  url_regex: 'https://.*\\.example\\.com/.*',
  app_name: 'Excel',
  app_exact: 'Microsoft Excel',
  app_regex: '(Code|IntelliJ)',
  window_title: 'Customer Portal',
  window_regex: 'PR #\\d+',
};

interface SearchResult {
  type: string;
  id: string;
  name: string;
}

export function ContextLinkPanel({ projectId, resourceType, resourceId }: ContextLinkPanelProps) {
  const [links, setLinks] = useState<ContextLink[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [matchType, setMatchType] = useState('url_pattern');
  const [matchValue, setMatchValue] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Search existing contexts to add
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [allLinks, setAllLinks] = useState<ContextLink[]>([]);
  const [searchResults, setSearchResults] = useState<ContextLink[]>([]);

  useEffect(() => {
    loadLinks();
  }, [projectId, resourceId]);

  const loadLinks = async () => {
    try {
      const data = await listContextLinks(projectId, resourceType, resourceId);
      setLinks(data);
    } catch {
      // ignore
    }
  };

  const loadAllLinks = async () => {
    try {
      const data = await listContextLinks(projectId);
      // Filter out links already on this resource
      const existing = new Set(links.map(l => l.id));
      setAllLinks(data.filter(l => !existing.has(l.id)));
      setSearchResults(data.filter(l => !existing.has(l.id)));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (searchMode) loadAllLinks();
  }, [searchMode]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(allLinks);
    } else {
      const q = searchQuery.toLowerCase();
      setSearchResults(allLinks.filter(l =>
        l.match_value.toLowerCase().includes(q) ||
        (l.note || '').toLowerCase().includes(q)
      ));
    }
  }, [searchQuery, allLinks]);

  const handleCreate = async () => {
    if (!matchValue.trim()) return;
    setSaving(true);
    try {
      await createContextLink({
        project_id: projectId,
        match_type: matchType,
        match_value: matchValue,
        resource_type: resourceType,
        resource_id: resourceId,
        note: note || undefined,
      });
      setMatchValue('');
      setNote('');
      setAddOpen(false);
      await loadLinks();
    } catch {
      // ignore
    }
    setSaving(false);
  };

  const handleAddExisting = async (link: ContextLink) => {
    setSaving(true);
    try {
      await createContextLink({
        project_id: projectId,
        match_type: link.match_type,
        match_value: link.match_value,
        resource_type: resourceType,
        resource_id: resourceId,
        note: link.note || undefined,
      });
      setSearchMode(false);
      setSearchQuery('');
      await loadLinks();
    } catch {
      // ignore
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteContextLink(id);
      setLinks(links.filter(l => l.id !== id));
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* Existing context links as tags */}
      {links.map(link => {
        const Icon = MATCH_ICONS[link.match_type] || IconWorld;
        return (
          <Badge
            key={link.id}
            variant="secondary"
            className="group flex items-center gap-1 pr-1 text-xs font-normal"
            title={link.note ? `📌 ${link.note}` : link.match_value}
          >
            <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="max-w-[150px] truncate">{link.match_value}</span>
            {link.note && (
              <span className="max-w-[100px] truncate text-muted-foreground">
                — {link.note}
              </span>
            )}
            <button
              onClick={() => handleDelete(link.id)}
              className="ml-0.5 rounded-sm opacity-0 hover:bg-destructive/20 group-hover:opacity-100"
            >
              <IconX className="h-3 w-3" />
            </button>
          </Badge>
        );
      })}

      {/* Add button */}
      <Popover open={addOpen} onOpenChange={setAddOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 rounded-full bg-primary/5 px-3 text-xs font-medium text-primary hover:bg-primary/10 hover:text-[#C44535]"
          >
            <IconLink className="h-3 w-3" />
            {links.length === 0 ? 'Add context' : <IconPlus className="h-3 w-3" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3" align="start">
          {/* Toggle between new and search existing */}
          <div className="mb-3 flex gap-1">
            <Button
              variant={!searchMode ? 'default' : 'outline'}
              size="sm"
              className="h-6 flex-1 text-xs"
              onClick={() => setSearchMode(false)}
            >
              New
            </Button>
            <Button
              variant={searchMode ? 'default' : 'outline'}
              size="sm"
              className="h-6 flex-1 text-xs"
              onClick={() => setSearchMode(true)}
            >
              <IconSearch className="mr-1 h-3 w-3" />
              Existing
            </Button>
          </div>

          {searchMode ? (
            <div className="space-y-2">
              <Input
                placeholder="Search existing context links..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-7 text-xs"
                autoFocus
              />
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {searchResults.length === 0 ? (
                  <p className="py-2 text-center text-xs text-muted-foreground">
                    {allLinks.length === 0 ? 'No other context links in this project' : 'No matches'}
                  </p>
                ) : (
                  searchResults.map(link => {
                    const Icon = MATCH_ICONS[link.match_type] || IconWorld;
                    return (
                      <button
                        key={link.id}
                        onClick={() => handleAddExisting(link)}
                        disabled={saving}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"
                      >
                        <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{link.match_value}</div>
                          {link.note && (
                            <div className="truncate text-muted-foreground">{link.note}</div>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Select value={matchType} onValueChange={setMatchType}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="url_pattern">URL Pattern</SelectItem>
                  <SelectItem value="url_exact">Exact URL</SelectItem>
                  <SelectItem value="url_regex">URL Regex</SelectItem>
                  <SelectItem value="app_name">App Name</SelectItem>
                  <SelectItem value="app_exact">App (Exact)</SelectItem>
                  <SelectItem value="app_regex">App Regex</SelectItem>
                  <SelectItem value="window_title">Window Title</SelectItem>
                  <SelectItem value="window_regex">Window Regex</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder={PLACEHOLDERS[matchType]}
                value={matchValue}
                onChange={e => setMatchValue(e.target.value)}
                className="h-7 text-xs"
                autoFocus
              />
              <Input
                placeholder="Note (optional)"
                value={note}
                onChange={e => setNote(e.target.value)}
                className="h-7 text-xs"
              />
              <div className="flex justify-end gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-xs"
                  onClick={() => setAddOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-6 text-xs"
                  onClick={handleCreate}
                  disabled={saving || !matchValue.trim()}
                >
                  Add
                </Button>
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
