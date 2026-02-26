import { useState, useEffect } from "react";
import {
  IconLink,
  IconPlus,
  IconX,
  IconWorld,
  IconDeviceDesktop,
  IconSearch,
  IconRegex,
  IconWindowMaximize,
  IconApps,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listContextLinks,
  createContextLink,
  deleteContextLink,
  listKnownApps,
  type ContextLink,
  type KnownApp,
} from "@/api/context-links";
import { cn } from "@/lib/utils";

interface ContextLinkPanelProps {
  projectId: string;
  resourceType: "workflow" | "document";
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

type MatchCategory = "url" | "app" | "window";
type MatchHow = "contains" | "exact" | "regex";

const MATCH_TYPE_MAP: Record<MatchCategory, Record<MatchHow, string>> = {
  url: { contains: "url_pattern", exact: "url_exact", regex: "url_regex" },
  app: { contains: "app_name", exact: "app_exact", regex: "app_regex" },
  window: {
    contains: "window_title",
    exact: "window_title",
    regex: "window_regex",
  },
};

const VALUE_PLACEHOLDERS: Record<MatchCategory, Record<MatchHow, string>> = {
  url: {
    contains: "e.g. salesforce.com",
    exact: "e.g. https://app.example.com/dashboard",
    regex: "e.g. https://.*\\.example\\.com/.*",
  },
  app: {
    contains: "e.g. Excel",
    exact: "e.g. Microsoft Excel",
    regex: "e.g. (Code|IntelliJ)",
  },
  window: {
    contains: "e.g. Customer Portal",
    exact: "e.g. Customer Portal - Dashboard",
    regex: "e.g. PR #\\d+",
  },
};

const POPULAR_APP_NAMES = [
  "VS Code",
  "Chrome",
  "Figma",
  "Slack",
  "Excel",
  "Word",
  "Notion",
  "Terminal",
  "Safari",
  "Firefox",
  "Xcode",
  "IntelliJ",
  "Postman",
  "Photoshop",
  "Teams",
  "Zoom",
];

export function ContextLinkPanel({
  projectId,
  resourceType,
  resourceId,
}: ContextLinkPanelProps) {
  const [links, setLinks] = useState<ContextLink[]>([]);
  const [addOpen, setAddOpen] = useState(false);

  // Two-step form state
  const [matchCategory, setMatchCategory] = useState<MatchCategory>("app");
  const [matchHow, setMatchHow] = useState<MatchHow>("contains");
  const [matchValue, setMatchValue] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Search existing contexts
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [allLinks, setAllLinks] = useState<ContextLink[]>([]);
  const [searchResults, setSearchResults] = useState<ContextLink[]>([]);

  // App picker state
  const [knownApps, setKnownApps] = useState<KnownApp[]>([]);
  const [appSearchQuery, setAppSearchQuery] = useState("");

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
      const existing = new Set(links.map((l) => l.id));
      setAllLinks(data.filter((l) => !existing.has(l.id)));
      setSearchResults(data.filter((l) => !existing.has(l.id)));
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
      setSearchResults(
        allLinks.filter(
          (l) =>
            l.match_value.toLowerCase().includes(q) ||
            (l.note || "").toLowerCase().includes(q),
        ),
      );
    }
  }, [searchQuery, allLinks]);

  // Load known apps when app category is selected
  useEffect(() => {
    if (matchCategory === "app" && knownApps.length === 0) {
      listKnownApps()
        .then(setKnownApps)
        .catch(() => {});
    }
  }, [matchCategory]);

  // Reset value when category changes
  useEffect(() => {
    setMatchValue("");
    setAppSearchQuery("");
  }, [matchCategory]);

  const getMatchType = (): string => MATCH_TYPE_MAP[matchCategory][matchHow];

  // Find aliases for selected app
  const selectedAppInfo = knownApps.find(
    (a) => a.name.toLowerCase() === matchValue.toLowerCase(),
  );

  // Filtered apps for autocomplete
  const filteredApps = appSearchQuery.trim()
    ? knownApps.filter((app) => {
        const q = appSearchQuery.toLowerCase();
        return (
          app.name.toLowerCase().includes(q) ||
          app.aliases.some((a) => a.toLowerCase().includes(q))
        );
      })
    : [];

  const handleCreate = async () => {
    if (!matchValue.trim()) return;
    setSaving(true);
    try {
      await createContextLink({
        project_id: projectId,
        match_type: getMatchType(),
        match_value: matchValue,
        resource_type: resourceType,
        resource_id: resourceId,
        note: note || undefined,
      });
      setMatchValue("");
      setNote("");
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
      setSearchQuery("");
      await loadLinks();
    } catch {
      // ignore
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteContextLink(id);
      setLinks(links.filter((l) => l.id !== id));
    } catch {
      // ignore
    }
  };

  const handleAppChipClick = (appName: string) => {
    setMatchValue(appName);
    setAppSearchQuery("");
  };

  // Map popular app names to known app data (fall back to stub)
  const popularApps = POPULAR_APP_NAMES.map((name) => {
    const known = knownApps.find((a) => a.name === name);
    return known || { name, aliases: [] as string[], bundle_id: "" };
  });

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* Existing context links as tags */}
      {links.map((link) => {
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
            className="border-dashed border-1 border-muted h-8 px-2"
          >
            <IconLink className="h-3 w-3" />
            {links.length === 0 ? (
              "Add context"
            ) : (
              <IconPlus className="h-3 w-3" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-3" align="start">
          {/* Toggle between New and Search Existing */}
          <div className="mb-3 flex gap-1">
            <Button
              variant={!searchMode ? "default" : "outline"}
              size="sm"
              className="h-6 flex-1 text-xs"
              onClick={() => setSearchMode(false)}
            >
              New
            </Button>
            <Button
              variant={searchMode ? "default" : "outline"}
              size="sm"
              className="h-6 flex-1 text-xs"
              onClick={() => setSearchMode(true)}
            >
              <IconSearch className="mr-1 h-3 w-3" />
              Existing
            </Button>
          </div>

          {searchMode ? (
            /* === SEARCH EXISTING MODE (unchanged) === */
            <div className="space-y-2">
              <Input
                placeholder="Search existing context links..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-7 text-xs"
                autoFocus
              />
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {searchResults.length === 0 ? (
                  <p className="py-2 text-center text-xs text-muted-foreground">
                    {allLinks.length === 0
                      ? "No other context links in this project"
                      : "No matches"}
                  </p>
                ) : (
                  searchResults.map((link) => {
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
                          <div className="truncate font-medium">
                            {link.match_value}
                          </div>
                          {link.note && (
                            <div className="truncate text-muted-foreground">
                              {link.note}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            /* === NEW LINK CREATION (redesigned two-step) === */
            <div className="space-y-3">
              {/* Step 1: WHAT to match */}
              <div>
                <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                  Match
                </div>
                <div className="flex gap-1">
                  {[
                    { key: "app" as MatchCategory, label: "App", icon: "💻" },
                    {
                      key: "window" as MatchCategory,
                      label: "Title",
                      icon: "📝",
                    },
                    { key: "url" as MatchCategory, label: "URL", icon: "🌐" },
                  ].map(({ key, label, icon }) => (
                    <button
                      key={key}
                      onClick={() => setMatchCategory(key)}
                      className={cn(
                        "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                        matchCategory === key
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <span className="text-sm leading-none">{icon}</span>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hint for URL matching */}
              {matchCategory === "url" && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400">
                  💡 URL matching requires the Chrome extension. For the desktop
                  app, use{" "}
                  <button
                    className="underline"
                    onClick={() => setMatchCategory("window")}
                  >
                    Window Title
                  </button>{" "}
                  instead — browser titles include the page name.
                </p>
              )}

              {/* Step 2: HOW to match */}
              <div>
                <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                  How
                </div>
                <Select
                  value={matchHow}
                  onValueChange={(v) => setMatchHow(v as MatchHow)}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contains">contains</SelectItem>
                    <SelectItem value="exact">is exactly</SelectItem>
                    <SelectItem value="regex">matches regex</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Step 3: VALUE input */}
              <div>
                <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                  Value
                </div>

                {matchCategory === "app" && matchHow !== "regex" ? (
                  /* App picker: chips + search */
                  <div className="space-y-2">
                    {/* Popular app chips */}
                    <div className="flex flex-wrap gap-1">
                      {popularApps.map((app) => (
                        <button
                          key={app.name}
                          onClick={() => handleAppChipClick(app.name)}
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
                            matchValue === app.name
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted/60 text-muted-foreground hover:bg-primary/10 hover:text-primary",
                          )}
                        >
                          {app.name}
                        </button>
                      ))}
                    </div>

                    {/* Search / type custom app name */}
                    <div className="relative">
                      <Input
                        placeholder="Or type app name..."
                        value={matchValue}
                        onChange={(e) => {
                          setMatchValue(e.target.value);
                          setAppSearchQuery(e.target.value);
                        }}
                        className="h-7 text-xs"
                      />
                      {/* Autocomplete dropdown */}
                      {appSearchQuery.trim() && filteredApps.length > 0 && (
                        <div className="absolute left-0 top-full z-10 mt-1 max-h-32 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
                          {filteredApps.slice(0, 8).map((app) => (
                            <button
                              key={app.name}
                              onClick={() => {
                                setMatchValue(app.name);
                                setAppSearchQuery("");
                              }}
                              className="flex w-full items-center justify-between rounded-sm px-2 py-1 text-left text-xs hover:bg-accent"
                            >
                              <span className="font-medium">{app.name}</span>
                              {app.aliases.length > 0 && (
                                <span className="text-[10px] text-muted-foreground">
                                  {app.aliases.slice(0, 2).join(", ")}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Show aliases for selected app */}
                    {selectedAppInfo && selectedAppInfo.aliases.length > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        Also matches: {selectedAppInfo.aliases.join(", ")}
                      </p>
                    )}
                  </div>
                ) : (
                  /* Standard text input for URL, Window Title, or App regex */
                  <Input
                    placeholder={VALUE_PLACEHOLDERS[matchCategory][matchHow]}
                    value={matchValue}
                    onChange={(e) => setMatchValue(e.target.value)}
                    className="h-7 text-xs"
                    autoFocus
                  />
                )}
              </div>

              {/* Note */}
              <Input
                placeholder="Note (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="h-7 text-xs"
              />

              {/* Actions */}
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
