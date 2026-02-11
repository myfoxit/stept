import React from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import {
  IconFileDescription,
  IconFolder,
  IconTimeline,
  IconLayoutDashboard,
  IconSortAscending,
  IconSortDescending,
  IconClock,
  IconPlayerPlay,
  IconCalendarEvent,
  IconAbc,
  IconPuzzle,
  IconListDetails,
  IconBrowser,
  IconComponents,
  IconDeviceFloppy,
  IconClipboardList,
  IconSettings,
  IconRobot,
  IconNote,
  IconLink,
  IconEyeOff,
  IconLock,
} from '@tabler/icons-react';
import * as TablerIcons from '@tabler/icons-react';

import { useProject } from '@/providers/project-provider';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { useFilteredDocuments } from '@/hooks/api/documents';
import { useFilteredWorkflows } from '@/hooks/api/workflows';
import { SiteHeader } from '@/components/site-header';

type FilterType = 'all' | 'pages' | 'workflows';
type SortBy = 'created_at' | 'updated_at' | 'name';
type SortOrder = 'asc' | 'desc';

// Utility: deterministic hash for stable "random" selection
function hashString(input: string) {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h << 5) - h + input.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

// Pool of icon + color combos (tailwind classes)
const ICON_POOL = [
  { Comp: IconPuzzle },
  { Comp: IconListDetails },
  { Comp: IconBrowser },
  { Comp: IconComponents },
  { Comp: IconDeviceFloppy },
  { Comp: IconClipboardList },
  { Comp: IconSettings },
  { Comp: IconRobot },
  { Comp: IconNote },
];

// REPLACE color palette + helpers
const COLOR_PALETTE = [
  'text-sky-600',
  'text-violet-600',
  'text-emerald-600',
  'text-amber-600',
  'text-rose-600',
  'text-indigo-600',
  'text-teal-600',
  'text-fuchsia-600',
  'text-orange-600',
];
function colorClasses(seed: string) {
  return COLOR_PALETTE[hashString(seed) % COLOR_PALETTE.length];
}
const DOC_TYPE_COLOR_MAP: Record<string, string> = {
  folder: 'text-amber-600',
  workflow: 'text-blue-600',
  application: 'text-green-600',
};

// Fallback deterministic icon (when doc.icon and doc_type specific icon aren't used)
function getDeterministicIcon(id: string, colorClass: string) {
  const idx = hashString(id) % ICON_POOL.length;
  const { Comp } = ICON_POOL[idx];
  return <Comp className={`size-6 ${colorClass}`} />;
}

function DocumentCard({ 
  doc, 
  onClick,
  isWorkflow = false,
}: { 
  doc: any; 
  onClick: () => void;
  isWorkflow?: boolean;
}) {
  const docType = isWorkflow ? 'workflow' : (doc.doc_type || 'page');
  const iconColor = DOC_TYPE_COLOR_MAP[docType] || colorClasses(doc.id || doc.name || '');

  const renderIcon = () => {
    // NEW: Check for stored icon on workflows
    if (isWorkflow && doc.icon_type && doc.icon_value) {
      if (doc.icon_type === 'tabler') {
        const iconName = doc.icon_value.startsWith('Icon') 
          ? doc.icon_value 
          : `Icon${doc.icon_value.charAt(0).toUpperCase()}${doc.icon_value.slice(1)}`;
        const TablerIcon = (TablerIcons as any)[iconName];
        if (TablerIcon) {
          const color = doc.icon_color || iconColor;
          return <TablerIcon className={`size-6 ${color}`} />;
        }
      } else if (doc.icon_type === 'favicon' && doc.icon_value) {
        return (
          <img 
            src={doc.icon_value} 
            alt="" 
            className="size-6 rounded"
            onError={(e) => {
              // Fallback to default icon on error
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        );
      }
    }

    if (isWorkflow || docType === 'workflow') {
      return <IconPlayerPlay className={`size-6 ${iconColor}`} />;
    }
    switch (docType) {
      case 'folder':
        return <IconFolder className={`size-6 ${iconColor}`} />;
      case 'application':
        return <IconLayoutDashboard className={`size-6 ${iconColor}`} />;
      default:
        return getDeterministicIcon(doc.id || doc.name || '', iconColor);
    }
  };

  const getTypeLabel = () => {
    if (isWorkflow) return 'Workflow';
    switch (docType) {
      case 'folder':
        return 'Folder';
      case 'workflow':
        return 'Workflow';
      case 'application':
        return 'Application';
      case 'app_page':
        return 'App Page';
      default:
        return 'Page';
    }
  };

  const typeLabel = getTypeLabel();
  const displayName = isWorkflow ? (doc.name || doc.title || 'Untitled workflow') : (doc.name || 'Untitled');

  return (
    <div
      className="group relative flex flex-col rounded-lg border border-muted bg-muted/30 hover:bg-muted/40 transition cursor-pointer p-4"
      onClick={onClick}
    >
      <div className="flex w-full items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted border border-muted-foreground/10">
          {renderIcon()}
        </div>
        <div className="flex-1 space-y-2 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-medium text-sm leading-snug line-clamp-2 min-w-0">
              {displayName}
            </h3>
            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
              <IconLink className="size-4 text-muted-foreground" />
              <IconEyeOff className="size-4 text-muted-foreground" />
              <IconLock className="size-4 text-muted-foreground" />
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            <span className="px-2 py-0.5 rounded bg-muted text-[10px] font-medium tracking-wide">
              {typeLabel}
            </span>
            {(doc.project_id || doc.projectId) && (
              <span className="px-2 py-0.5 rounded bg-muted/70 text-[10px]">
                {(doc.project_id || doc.projectId).slice(0, 8)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <IconClock className="size-3" />
            <span>{formatDistanceToNow(new Date(doc.updated_at || doc.created_at), { addSuffix: true })}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DocumentGalleryPage() {
  const { type = 'all' } = useParams<{ type: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { selectedProjectId } = useProject();

  const filterType = (type as FilterType) || 'all';
  const sortBy = (searchParams.get('sortBy') as SortBy) || 'updated_at';
  const sortOrder = (searchParams.get('sortOrder') as SortOrder) || 'desc';

  // Fetch documents (pages) - only when filterType is 'all' or 'pages'
  const { data: documents = [], isLoading: isLoadingDocs } = useFilteredDocuments(
    filterType !== 'workflows' ? selectedProjectId : undefined,
    'all', // Always fetch all docs, we'll filter client-side if needed
    sortBy,
    sortOrder
  );

  // Fetch workflows - only when filterType is 'all' or 'workflows'
  const { data: workflows = [], isLoading: isLoadingWorkflows } = useFilteredWorkflows(
    filterType !== 'pages' ? selectedProjectId : undefined,
    undefined, // no folder filter
    sortBy,
    sortOrder
  );

  const isLoading = isLoadingDocs || isLoadingWorkflows;

  // Combine and filter based on filterType
  const displayItems = React.useMemo(() => {
    if (filterType === 'pages') {
      return documents.map(doc => ({ ...doc, _isWorkflow: false }));
    }
    if (filterType === 'workflows') {
      return workflows.map(wf => ({ ...wf, _isWorkflow: true }));
    }
    // 'all' - combine both
    const docItems = documents.map(doc => ({ ...doc, _isWorkflow: false }));
    const wfItems = workflows.map(wf => ({ ...wf, _isWorkflow: true }));
    
    // Sort combined list
    const combined = [...docItems, ...wfItems];
    combined.sort((a, b) => {
      let aVal: any, bVal: any;
      if (sortBy === 'name') {
        aVal = (a.name || a.title || '').toLowerCase();
        bVal = (b.name || b.title || '').toLowerCase();
      } else if (sortBy === 'updated_at') {
        aVal = new Date(a.updated_at || a.created_at).getTime();
        bVal = new Date(b.updated_at || b.created_at).getTime();
      } else {
        aVal = new Date(a.created_at).getTime();
        bVal = new Date(b.created_at).getTime();
      }
      
      if (sortOrder === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      }
      return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
    });
    
    return combined;
  }, [documents, workflows, filterType, sortBy, sortOrder]);

  const handleSortChange = (newSortBy: SortBy) => {
    const newOrder = sortBy === newSortBy && sortOrder === 'desc' ? 'asc' : 'desc';
    setSearchParams({
      sortBy: newSortBy,
      sortOrder: newOrder,
    });
  };

  const handleFilterChange = (newFilter: FilterType) => {
    navigate(`/documents/${newFilter}?${searchParams.toString()}`);
  };

  const getTitle = () => {
    switch (filterType) {
      case 'pages':
        return 'Pages';
      case 'workflows':
        return 'Workflows';
      default:
        return 'All Documents';
    }
  };

  const getSortIcon = (field: SortBy) => {
    if (sortBy !== field) return null;
    return sortOrder === 'asc' ? 
      <IconSortAscending className="size-4" /> : 
      <IconSortDescending className="size-4" />;
  };

  if (!selectedProjectId) {
    return (
      <div>
        <SiteHeader name="Documents" />
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Please select a project</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <SiteHeader name={getTitle()}>
        <Tabs value={filterType} onValueChange={(v) => handleFilterChange(v as FilterType)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="pages">Pages</TabsTrigger>
            <TabsTrigger value="workflows">Workflows</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-1">
          <Button
            variant={sortBy === 'updated_at' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => handleSortChange('updated_at')}
            className="gap-1"
          >
            <IconClock className="size-4" />
            {getSortIcon('updated_at')}
          </Button>
          <Button
            variant={sortBy === 'created_at' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => handleSortChange('created_at')}
            className="gap-1"
          >
            <IconCalendarEvent className="size-4" />
            {getSortIcon('created_at')}
          </Button>
          <Button
            variant={sortBy === 'name' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => handleSortChange('name')}
            className="gap-1"
          >
            <IconAbc className="size-4" />
            {getSortIcon('name')}
          </Button>
        </div>
      </SiteHeader>

      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">Loading documents...</p>
          </div>
        ) : displayItems.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">No documents found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {displayItems.map((item: any) => (
              <DocumentCard
                key={item.id}
                doc={item}
                isWorkflow={item._isWorkflow}
                onClick={() => {
                  if (item._isWorkflow) {
                    navigate(`/workflow/${item.id}`);
                  } else {
                    const targetPath = item.doc_type === 'folder' 
                      ? `/folder/${item.id}`
                      : `/editor/${item.id}`;
                    navigate(targetPath);
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


