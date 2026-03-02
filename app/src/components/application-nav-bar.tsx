import * as React from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Upload,
  ImageIcon,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Page {
  id: string;
  name?: string | null;
  position: number;
  children?: Page[];  // Hierarchical structure
}

interface ApplicationNavBarProps {
  appName: string;
  logoUrl?: string;
  pages: Page[];  // Now hierarchical
  selectedPageId: string | null;
  mode: 'preview' | 'edit';
  onPageSelect: (pageId: string) => void;
  onAppNameChange: (name: string) => void;
  onLogoChange: (url: string) => void;
  onCreatePage: (title: string, parentId?: string) => Promise<any>;
  onDeletePage: (pageId: string) => void;
  onRenamePage: (pageId: string, newName: string) => void;
}

// Recursive component for nested menu items
function PageMenuItem({
  page,
  selectedPageId,
  mode,
  onPageSelect,
  onCreatePage,
  onDeletePage,
  onRenamePage,
  level = 0,
}: {
  page: Page;
  selectedPageId: string | null;
  mode: 'preview' | 'edit';
  onPageSelect: (pageId: string) => void;
  onCreatePage: (title: string, parentId?: string) => Promise<any>;
  onDeletePage: (pageId: string) => void;
  onRenamePage: (pageId: string, newName: string) => void;
  level?: number;
}) {
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [tempPageName, setTempPageName] = useState('');
  const hasChildren = page.children && page.children.length > 0;

  if (editingPageId === page.id && mode === 'edit') {
    return (
      <Input
        value={tempPageName}
        onChange={(e) => setTempPageName(e.target.value)}
        onBlur={() => {
          if (tempPageName.trim()) {
            onRenamePage(page.id, tempPageName);
          }
          setEditingPageId(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (tempPageName.trim()) {
              onRenamePage(page.id, tempPageName);
            }
            setEditingPageId(null);
          }
        }}
        className="h-8 w-32"
        autoFocus
      />
    );
  }

  // If has children, show as dropdown
  if (hasChildren) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={selectedPageId === page.id ? 'secondary' : 'ghost'}
            size="sm"
            className="relative"
          >
            {page.name || 'Untitled'}
            <ChevronDown className="size-3 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem onClick={() => onPageSelect(page.id)}>
            View {page.name || 'Untitled'}
          </DropdownMenuItem>
          {mode === 'edit' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  setEditingPageId(page.id);
                  setTempPageName(page.name || '');
                }}
              >
                <Pencil className="size-4 mr-2" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  const title = prompt('New subpage title:');
                  if (title) {
                    await onCreatePage(title, page.id);
                  }
                }}
              >
                <Plus className="size-4 mr-2" />
                Add Subpage
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {page.children!.map((child) => (
            <DropdownMenuItem
              key={child.id}
              onClick={() => onPageSelect(child.id)}
              className={cn(
                selectedPageId === child.id && "bg-secondary"
              )}
            >
              {child.name || 'Untitled'}
            </DropdownMenuItem>
          ))}
          {mode === 'edit' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => onDeletePage(page.id)}
              >
                <Trash2 className="size-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Simple button for pages without children
  return (
    <div className="relative flex items-center">
      <Button
        variant={selectedPageId === page.id ? 'secondary' : 'ghost'}
        size="sm"
        className="relative"
        onClick={() => onPageSelect(page.id)}
      >
        {page.name || 'Untitled'}
      </Button>
      {mode === 'edit' && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="size-5 ml-1 opacity-0 hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              onClick={() => {
                setEditingPageId(page.id);
                setTempPageName(page.name || '');
              }}
            >
              <Pencil className="size-4 mr-2" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async () => {
                const title = prompt('New subpage title:');
                if (title) {
                  await onCreatePage(title, page.id);
                }
              }}
            >
              <Plus className="size-4 mr-2" />
              Add Subpage
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => onDeletePage(page.id)}
            >
              <Trash2 className="size-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

export function ApplicationNavBar({
  appName,
  logoUrl,
  pages,
  selectedPageId,
  mode,
  onPageSelect,
  onAppNameChange,
  onLogoChange,
  onCreatePage,
  onDeletePage,
  onRenamePage,
}: ApplicationNavBarProps) {
  const [editingAppName, setEditingAppName] = useState(false);
  const [tempAppName, setTempAppName] = useState(appName);
  const [logoDialogOpen, setLogoDialogOpen] = useState(false);
  const [tempLogoUrl, setTempLogoUrl] = useState(logoUrl || '');
  const [createPageOpen, setCreatePageOpen] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState('');
  
  const handleAppNameSave = () => {
    onAppNameChange(tempAppName);
    setEditingAppName(false);
  };
  
  const handleLogoSave = () => {
    onLogoChange(tempLogoUrl);
    setLogoDialogOpen(false);
  };
  
  const handleCreatePage = async () => {
    if (newPageTitle.trim()) {
      await onCreatePage(newPageTitle);
      setNewPageTitle('');
      setCreatePageOpen(false);
    }
  };
  
  return (
    <>
      <nav className="border-b bg-background">
        <div className="flex h-14 items-center px-4 gap-6">
          {/* Logo */}
          <div className="flex items-center gap-2">
            {logoUrl ? (
              <img 
                src={logoUrl} 
                alt={appName} 
                className="h-8 w-8 object-contain rounded"
              />
            ) : (
              <div className="h-8 w-8 bg-muted rounded flex items-center justify-center">
                <ImageIcon className="size-4 text-muted-foreground" />
              </div>
            )}
            
            {mode === 'edit' && (
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                onClick={() => setLogoDialogOpen(true)}
              >
                <Upload className="size-3" />
              </Button>
            )}
          </div>
          
          {/* App Name */}
          <div className="flex items-center gap-2">
            {editingAppName && mode === 'edit' ? (
              <Input
                value={tempAppName}
                onChange={(e) => setTempAppName(e.target.value)}
                onBlur={handleAppNameSave}
                onKeyDown={(e) => e.key === 'Enter' && handleAppNameSave()}
                className="h-8 w-48"
                autoFocus
              />
            ) : (
              <h1 
                className={cn(
                  "text-lg font-semibold",
                  mode === 'edit' && "cursor-pointer hover:text-primary"
                )}
                onClick={() => mode === 'edit' && setEditingAppName(true)}
              >
                {appName}
              </h1>
            )}
          </div>
          
          {/* Navigation Links */}
          <div className="flex-1 flex items-center gap-1">
            {pages.map((page) => (
              <PageMenuItem
                key={page.id}
                page={page}
                selectedPageId={selectedPageId}
                mode={mode}
                onPageSelect={onPageSelect}
                onCreatePage={onCreatePage}
                onDeletePage={onDeletePage}
                onRenamePage={onRenamePage}
              />
            ))}
            
            {mode === 'edit' && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setCreatePageOpen(true)}
              >
                <Plus className="size-4 mr-1" />
                Add Page
              </Button>
            )}
          </div>
        </div>
      </nav>
      
      {/* Logo Upload Dialog */}
      <Dialog open={logoDialogOpen} onOpenChange={setLogoDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Logo</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="logoUrl">Logo URL</Label>
              <Input
                id="logoUrl"
                value={tempLogoUrl}
                onChange={(e) => setTempLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
              />
            </div>
            {tempLogoUrl && (
              <div className="flex justify-center p-4 border rounded">
                <img 
                  src={tempLogoUrl} 
                  alt="Preview" 
                  className="h-16 w-16 object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '';
                    (e.target as HTMLImageElement).alt = 'Invalid URL';
                  }}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogoDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleLogoSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Create Page Dialog */}
      <Dialog open={createPageOpen} onOpenChange={setCreatePageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Page</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="pageTitle">Page Title</Label>
              <Input
                id="pageTitle"
                value={newPageTitle}
                onChange={(e) => setNewPageTitle(e.target.value)}
                placeholder="Page title"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatePageOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreatePage} disabled={!newPageTitle.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
