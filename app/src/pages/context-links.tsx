import { useState, useEffect, useMemo, useCallback } from 'react';
import { SettingsLayout } from '@/components/settings-layout';
import {
  Link,
  Plus,
  Trash2,
  Globe,
  LayoutGrid,
  FileText,
  ListTree,
  Filter,
  Regex,
  Pencil,
  ChevronDown,
  ChevronUp,
  Code,
  Search,
  Monitor,
  AppWindow,
  Maximize2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useProject } from '@/providers/project-provider';
import {
  listContextLinks,
  createContextLink,
  updateContextLink,
  deleteContextLink,
  listKnownApps,
  type ContextLink,
  type MatchType,
  type KnownApp,
} from '@/api/context-links';
import { listWorkflows, getFilteredWorkflows } from '@/api/workflows';
import { listDocuments } from '@/api/documents';

// ── Constants ───────────────────────────────────────────────────────────

const MATCH_TYPE_META: Record<
  MatchType,
  { label: string; icon: typeof Globe; category: 'url' | 'app' | 'window'; placeholder: string; description: string }
> = {
  url_exact: {
    label: 'Exact URL',
    icon: Globe,
    category: 'url',
    placeholder: 'https://app.example.com/dashboard',
    description: 'Matches when the URL is exactly this value (requires Chrome extension)',
  },
  url_pattern: {
    label: 'URL Pattern',
    icon: Globe,
    category: 'url',
    placeholder: '*.salesforce.com/*/Account*',
    description: 'Glob/wildcard pattern on the full URL (requires Chrome extension)',
  },
  url_regex: {
    label: 'URL Regex',
    icon: Regex,
    category: 'url',
    placeholder: 'https://.*\\.example\\.com/dashboard/\\d+',
    description: 'Regular expression matched against the full URL (requires Chrome extension)',
  },
  app_name: {
    label: 'App Name',
    icon: LayoutGrid,
    category: 'app',
    placeholder: 'Excel',
    description: 'Case-insensitive partial match — "Excel" matches "Microsoft Excel"',
  },
  app_exact: {
    label: 'App (Exact)',
    icon: Monitor,
    category: 'app',
    placeholder: 'Microsoft Excel',
    description: 'Exact match on the application name',
  },
  app_regex: {
    label: 'App Regex',
    icon: Regex,
    category: 'app',
    placeholder: '(Code|IntelliJ|Xcode)',
    description: 'Regular expression matched against the app name',
  },
  window_title: {
    label: 'Window Title',
    icon: Maximize2,
    category: 'window',
    placeholder: 'Customer Portal',
    description: 'Case-insensitive substring match on the window title',
  },
  window_regex: {
    label: 'Window Regex',
    icon: Regex,
    category: 'window',
    placeholder: 'PR #\\d+ -',
    description: 'Regular expression matched against the window title',
  },
};

const ALL_MATCH_TYPES = Object.keys(MATCH_TYPE_META) as MatchType[];

const SIMPLE_MATCH_TYPES: MatchType[] = ['url_exact', 'url_pattern', 'app_name', 'window_title'];
const ADVANCED_MATCH_TYPES: MatchType[] = ALL_MATCH_TYPES;

const FILTER_CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'url', label: 'URL' },
  { key: 'app', label: 'App' },
  { key: 'window', label: 'Window' },
] as const;

// ── Types ───────────────────────────────────────────────────────────────

interface ResourceOption {
  type: 'workflow' | 'document';
  id: string;
  name: string;
}

interface RuleGroup {
  groupId: string | null;
  links: ContextLink[];
  maxPriority: number;
}

// ── Component ───────────────────────────────────────────────────────────

export function ContextLinksPage() {
  const { selectedProjectId } = useProject();
  const [links, setLinks] = useState<ContextLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<ContextLink | null>(null);
  const [advancedMode, setAdvancedMode] = useState(false);

  // Form state
  const [matchType, setMatchType] = useState<MatchType>('url_pattern');
  const [matchValue, setMatchValue] = useState('');
  const [resourceType, setResourceType] = useState<'workflow' | 'document'>('workflow');
  const [resourceId, setResourceId] = useState('');
  const [note, setNote] = useState('');
  const [priority, setPriority] = useState(0);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Resource picker
  const [resources, setResources] = useState<ResourceOption[]>([]);
  const [resourceSearch, setResourceSearch] = useState('');
  const [loadingResources, setLoadingResources] = useState(false);

  // Known apps
  const [knownApps, setKnownApps] = useState<KnownApp[]>([]);
  const [appSearch, setAppSearch] = useState('');

  // ── Data loading ────────────────────────────────────────────────────

  useEffect(() => {
    if (selectedProjectId) loadLinks();
  }, [selectedProjectId]);

  useEffect(() => {
    loadKnownApps();
  }, []);

  const loadLinks = async () => {
    if (!selectedProjectId) return;
    setLoading(true);
    try {
      const data = await listContextLinks(selectedProjectId);
      setLinks(data);
    } catch (e) {
      console.error('Failed to load context links:', e);
    }
    setLoading(false);
  };

  const loadKnownApps = async () => {
    try {
      const apps = await listKnownApps();
      setKnownApps(apps);
    } catch {
      // Known apps are optional — continue silently
    }
  };

  const loadResources = useCallback(async () => {
    if (!selectedProjectId) return;
    setLoadingResources(true);
    try {
      const [workflows, documents] = await Promise.all([
        getFilteredWorkflows(selectedProjectId, undefined, 'updated_at', 'desc', 0, 100),
        listDocuments(),
      ]);
      const opts: ResourceOption[] = [
        ...workflows.map((w) => ({ type: 'workflow' as const, id: w.id, name: w.name || 'Untitled Workflow' })),
        ...documents.map((d) => ({ type: 'document' as const, id: d.id, name: d.name || 'Untitled Document' })),
      ];
      setResources(opts);
    } catch {
      // ignore
    }
    setLoadingResources(false);
  }, [selectedProjectId]);

  useEffect(() => {
    if (dialogOpen) loadResources();
  }, [dialogOpen, loadResources]);

  // ── Grouped links for display ───────────────────────────────────────

  const ruleGroups = useMemo((): RuleGroup[] => {
    const groupMap = new Map<string, ContextLink[]>();
    let soloIdx = 0;

    for (const link of links) {
      const key = link.group_id || `__solo_${soloIdx++}`;
      const existing = groupMap.get(key) || [];
      existing.push(link);
      groupMap.set(key, existing);
    }

    const groups: RuleGroup[] = [];
    for (const [key, groupLinks] of groupMap) {
      groups.push({
        groupId: key.startsWith('__solo_') ? null : key,
        links: groupLinks.sort((a, b) => b.priority - a.priority),
        maxPriority: Math.max(...groupLinks.map((l) => l.priority)),
      });
    }

    groups.sort((a, b) => b.maxPriority - a.maxPriority);
    return groups;
  }, [links]);

  // Existing group IDs for the "add to group" selector
  const existingGroupIds = useMemo(() => {
    const ids = new Set<string>();
    for (const link of links) {
      if (link.group_id) ids.add(link.group_id);
    }
    return Array.from(ids);
  }, [links]);

  // ── Filtering ───────────────────────────────────────────────────────

  const filteredGroups = useMemo(() => {
    if (filter === 'all') return ruleGroups;
    return ruleGroups.filter((g) =>
      g.links.some((l) => MATCH_TYPE_META[l.match_type]?.category === filter),
    );
  }, [ruleGroups, filter]);

  const totalCount = links.length;
  const filteredCount = filteredGroups.reduce((sum, g) => sum + g.links.length, 0);

  // ── App picker filtering ────────────────────────────────────────────

  const filteredApps = useMemo(() => {
    if (!appSearch.trim()) return knownApps;
    const q = appSearch.toLowerCase();
    return knownApps.filter(
      (app) =>
        app.name.toLowerCase().includes(q) ||
        app.aliases.some((a) => a.toLowerCase().includes(q)),
    );
  }, [knownApps, appSearch]);

  // ── Resource picker filtering ───────────────────────────────────────

  const filteredResources = useMemo(() => {
    const byType = resources.filter((r) => r.type === resourceType);
    if (!resourceSearch.trim()) return byType;
    const q = resourceSearch.toLowerCase();
    return byType.filter((r) => r.name.toLowerCase().includes(q));
  }, [resources, resourceType, resourceSearch]);

  // ── Form helpers ────────────────────────────────────────────────────

  const resetForm = () => {
    setMatchType('url_pattern');
    setMatchValue('');
    setResourceType('workflow');
    setResourceId('');
    setNote('');
    setPriority(0);
    setGroupId(null);
    setEditingLink(null);
    setAdvancedMode(false);
    setAppSearch('');
    setResourceSearch('');
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (link: ContextLink) => {
    setEditingLink(link);
    setMatchType(link.match_type);
    setMatchValue(link.match_value);
    setResourceType(link.resource_type);
    setResourceId(link.resource_id);
    setNote(link.note || '');
    setPriority(link.priority);
    setGroupId(link.group_id || null);
    setAdvancedMode(
      !SIMPLE_MATCH_TYPES.includes(link.match_type),
    );
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!matchValue.trim() || !selectedProjectId) return;
    setSaving(true);
    try {
      if (editingLink) {
        await updateContextLink(editingLink.id, {
          match_type: matchType,
          match_value: matchValue,
          resource_type: resourceType,
          resource_id: resourceId || 'note-only',
          note: note || undefined,
          priority,
          group_id: groupId || undefined,
        });
      } else {
        await createContextLink({
          project_id: selectedProjectId,
          match_type: matchType,
          match_value: matchValue,
          resource_type: resourceType,
          resource_id: resourceId || 'note-only',
          note: note || undefined,
          priority,
          group_id: groupId || undefined,
        });
      }
      setDialogOpen(false);
      resetForm();
      await loadLinks();
    } catch (e) {
      console.error('Failed to save context link:', e);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteContextLink(id);
      setLinks((prev) => prev.filter((l) => l.id !== id));
    } catch (e) {
      console.error('Failed to delete context link:', e);
    }
  };

  // ── Match type select items ─────────────────────────────────────────

  const matchTypeOptions = advancedMode ? ADVANCED_MATCH_TYPES : SIMPLE_MATCH_TYPES;
  const isAppType = matchType === 'app_name' || matchType === 'app_exact' || matchType === 'app_regex';

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <SettingsLayout title="Context Links" description="Rules that surface workflows and documents based on the active app, URL, or window title.">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <div className="flex gap-1">
              {FILTER_CATEGORIES.map((cat) => (
                <Badge
                  key={cat.key}
                  variant={filter === cat.key ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => setFilter(cat.key)}
                >
                  {cat.label}
                </Badge>
              ))}
            </div>
            <span className="ml-2 text-xs text-muted-foreground">
              {filteredCount} rule{filteredCount !== 1 ? 's' : ''}
              {filter !== 'all' && ` of ${totalCount}`}
            </span>
          </div>
          <Button onClick={openCreate} className="gap-1">
            <Plus className="h-4 w-4" />
            Add Rule
          </Button>
        </div>

        {/* Rules List */}
        {loading ? (
          <div className="py-12 text-center text-muted-foreground">Loading...</div>
        ) : filteredGroups.length === 0 ? (
          <div className="py-12 text-center">
            <Link className="mx-auto h-12 w-12 text-muted-foreground/30" />
            <p className="mt-3 text-muted-foreground">
              {totalCount === 0
                ? 'No context rules yet. Add one to get started.'
                : 'No rules match this filter.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredGroups.map((group, gi) => (
              <div key={group.groupId || `solo-${gi}`}>
                {/* Group container */}
                {group.links.length > 1 && group.groupId ? (
                  <div className="rounded-lg border-2 border-dashed border-primary/20 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                        AND Group
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        All conditions must match
                      </span>
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        Priority: {group.maxPriority}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {group.links.map((link, li) => (
                        <div key={link.id}>
                          <RuleCard
                            link={link}
                            onEdit={() => openEdit(link)}
                            onDelete={() => handleDelete(link.id)}
                            resources={resources}
                          />
                          {li < group.links.length - 1 && (
                            <div className="flex items-center justify-center py-1">
                              <div className="rounded-full bg-primary/10 px-3 py-0.5 text-[10px] font-semibold text-primary">
                                AND
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  group.links.map((link) => (
                    <RuleCard
                      key={link.id}
                      link={link}
                      onEdit={() => openEdit(link)}
                      onDelete={() => handleDelete(link.id)}
                      resources={resources}
                    />
                  ))
                )}

                {/* OR divider between groups */}
                {gi < filteredGroups.length - 1 && (
                  <div className="flex items-center gap-3 py-2">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      OR
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Create / Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); resetForm(); } else setDialogOpen(true); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingLink ? 'Edit Rule' : 'Add Context Rule'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Advanced mode toggle */}
              <div className="flex items-center justify-end">
                <button
                  onClick={() => setAdvancedMode(!advancedMode)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Code className="h-3 w-3" />
                  {advancedMode ? 'Simple Mode' : 'Advanced Mode'}
                </button>
              </div>

              {/* Match Type */}
              <div>
                <label className="mb-1 block text-sm font-medium">When</label>
                <Select value={matchType} onValueChange={(v) => { setMatchType(v as MatchType); setMatchValue(''); setAppSearch(''); }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {matchTypeOptions.map((mt) => {
                      const meta = MATCH_TYPE_META[mt];
                      const MtIcon = meta.icon;
                      return (
                        <SelectItem key={mt} value={mt}>
                          <div className="flex items-center gap-2">
                            <MtIcon className="h-4 w-4 text-muted-foreground" />
                            <span>{meta.label}</span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  {MATCH_TYPE_META[matchType]?.description}
                </p>
              </div>

              {/* Match Value — App Picker or text input */}
              <div>
                <label className="mb-1 block text-sm font-medium">
                  {isAppType ? 'Application' : matchType.startsWith('window') ? 'Window Title' : 'URL'}
                </label>
                {isAppType && matchType === 'app_name' ? (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search apps or type custom name..."
                        className="pl-8"
                        value={appSearch || matchValue}
                        onChange={(e) => {
                          setAppSearch(e.target.value);
                          setMatchValue(e.target.value);
                        }}
                      />
                    </div>
                    {(appSearch || !matchValue) && filteredApps.length > 0 && (
                      <div className="max-h-40 overflow-y-auto rounded-md border">
                        {filteredApps.slice(0, 15).map((app) => (
                          <button
                            key={app.bundle_id}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                            onClick={() => {
                              setMatchValue(app.aliases[0] || app.name);
                              setAppSearch('');
                            }}
                          >
                            <LayoutGrid className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <div className="font-medium">{app.name}</div>
                              {app.aliases.length > 0 && (
                                <div className="truncate text-xs text-muted-foreground">
                                  {app.aliases.join(', ')}
                                </div>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <Input
                    placeholder={MATCH_TYPE_META[matchType]?.placeholder}
                    value={matchValue}
                    onChange={(e) => setMatchValue(e.target.value)}
                  />
                )}
              </div>

              {/* Resource picker */}
              <div>
                <label className="mb-1 block text-sm font-medium">Then surface</label>
                <div className="flex gap-2">
                  <Select value={resourceType} onValueChange={(v) => { setResourceType(v as 'workflow' | 'document'); setResourceId(''); setResourceSearch(''); }}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="workflow">Workflow</SelectItem>
                      <SelectItem value="document">Document</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder={loadingResources ? 'Loading...' : `Search ${resourceType}s...`}
                        className="pl-8"
                        value={resourceSearch || filteredResources.find((r) => r.id === resourceId)?.name || ''}
                        onChange={(e) => {
                          setResourceSearch(e.target.value);
                          if (!e.target.value) setResourceId('');
                        }}
                        onFocus={() => setResourceSearch(resourceSearch || '')}
                      />
                    </div>
                    {resourceSearch !== undefined && filteredResources.length > 0 && resourceSearch !== '' && (
                      <div className="mt-1 max-h-32 overflow-y-auto rounded-md border">
                        {filteredResources.slice(0, 10).map((r) => (
                          <button
                            key={r.id}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
                            onClick={() => {
                              setResourceId(r.id);
                              setResourceSearch('');
                            }}
                          >
                            {r.type === 'workflow' ? (
                              <ListTree className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                            <span className="truncate">{r.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {resourceId && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Selected: {resources.find((r) => r.id === resourceId)?.name || resourceId}
                  </p>
                )}
              </div>

              {/* Group selector */}
              <div>
                <label className="mb-1 block text-sm font-medium">Rule Group</label>
                <Select value={groupId || '__standalone'} onValueChange={(v) => setGroupId(v === '__standalone' ? null : v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__standalone">Standalone rule (no group)</SelectItem>
                    <SelectItem value="__new">Create new AND group</SelectItem>
                    {existingGroupIds.map((gid) => (
                      <SelectItem key={gid} value={gid}>
                        Add to group: {gid}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Rules in the same group must ALL match (AND). Different groups are OR'd.
                </p>
              </div>

              {/* Priority */}
              <div>
                <label className="mb-1 block text-sm font-medium">Priority</label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={priority}
                    onChange={(e) => setPriority(Number(e.target.value))}
                    className="w-20"
                  />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={priority}
                    onChange={(e) => setPriority(Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-xs text-muted-foreground">Higher = shown first</span>
                </div>
              </div>

              {/* Note */}
              <div>
                <label className="mb-1 block text-sm font-medium">Note (optional)</label>
                <Textarea
                  placeholder="Important: always check duplicate contacts first..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="min-h-[60px]"
                />
              </div>

              {/* Advanced: JSON preview */}
              {advancedMode && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-muted-foreground">Rule Preview</label>
                  <pre className="rounded-md bg-muted p-3 text-xs">
                    {JSON.stringify(
                      {
                        match_type: matchType,
                        match_value: matchValue,
                        resource_type: resourceType,
                        resource_id: resourceId || 'note-only',
                        priority,
                        group_id: groupId,
                        note: note || undefined,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving || !matchValue.trim()}>
                {saving ? 'Saving...' : editingLink ? 'Update' : 'Create Rule'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </SettingsLayout>
  );
}

// ── Rule Card ───────────────────────────────────────────────────────────

function RuleCard({
  link,
  onEdit,
  onDelete,
  resources,
}: {
  link: ContextLink;
  onEdit: () => void;
  onDelete: () => void;
  resources: ResourceOption[];
}) {
  const meta = MATCH_TYPE_META[link.match_type] || MATCH_TYPE_META.url_pattern;
  const Icon = meta.icon;
  const resourceName = resources.find((r) => r.id === link.resource_id)?.name;

  return (
    <Card className="group transition-shadow hover:shadow-sm">
      <CardContent className="flex items-start gap-3 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          {/* IF ... THEN ... */}
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="font-semibold text-muted-foreground">IF</span>
            <Badge variant="outline" className="text-[10px]">
              {meta.label}
            </Badge>
            <span className="font-mono text-sm font-medium break-all">{link.match_value}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm">
            <span className="font-semibold text-muted-foreground">THEN</span>
            {link.resource_type === 'workflow' ? (
              <ListTree className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span className="text-sm">{resourceName || link.resource_id}</span>
          </div>
          {link.note && (
            <div className="mt-2 rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              {link.note}
            </div>
          )}
          {link.priority > 0 && (
            <span className="mt-1 inline-block text-[10px] text-muted-foreground">
              Priority: {link.priority}
            </span>
          )}
        </div>
        <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
