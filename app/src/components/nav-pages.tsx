import * as React from 'react';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from '@/components/ui/sidebar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  IconFileDescription,
  IconPlus,
  IconDots,
  IconEdit,
  IconShare3,
  IconListCheck,
  IconPlayerPlayFilled,
  IconPlayerPlay,
  IconListTree,
  IconChecklist,
  IconFileCheckFilled,
  IconClipboardDataFilled,
  IconTrash,
  IconChevronRight,
  IconChevronDown,
  IconCopy,
  IconArrowsMove,
  IconLayoutDashboard,
  IconCircleCaretRightFilled,
  IconCaretRightFilled,
  IconPlayerRecordFilled,
  IconFolder,
  IconFolderOpen,
  IconTimeline,
  IconFiles,
  IconLock,  // NEW: For private indicator
  IconWorld,  // NEW: For shared indicator
} from '@tabler/icons-react';
import { Link, useNavigate } from 'react-router-dom';

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useProject } from '@/providers/project-provider';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { useSaveDocument, useDeleteDocument, useDuplicateDocument, useCreateDocument, useMoveDocument } from '@/hooks/api/documents';
import { useUpdateFolder, useDeleteFolder, useToggleFolderExpansion, useDuplicateFolder, useCreateFolder, useMoveFolder, useFolderTree } from '@/hooks/api/folders';
import { useMoveWorkflow, useDeleteWorkflow, useDuplicateWorkflow } from '@/hooks/api/workflows';
import { useUpdateWorkflow } from '@/hooks/api/workflows';

interface DocumentNode {
  id: string;
  name?: string | null;
  icon?: string | null;
  parent_id?: string | null;
  path: string;
  depth: number;
  position: number;
  is_expanded: boolean;
  is_folder: boolean;
  is_workflow: boolean;
  is_private: boolean;  // NEW
  owner_id?: string | null;  // NEW
  children: DocumentNode[];
}

function NavPageItem({
  doc,
  userRole,
  level = 0,
  onDragEnd,
  isPrivateSection,  // NEW: Track which section we're in
}: {
  doc: DocumentNode;
  userRole: string;
  level?: number;
  onDragEnd?: () => void;
  isPrivateSection?: boolean;  // NEW
}) {
  const navigate = useNavigate();
  const { selectedProjectId } = useProject();
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [newTitle, setNewTitle] = React.useState(doc.name || 'Untitled');
  const [createChildOpen, setCreateChildOpen] = React.useState(false);
  const [childTitle, setChildTitle] = React.useState('');
  const [childType, setChildType] = React.useState<'folder' | 'document'>(
    'document'
  );
  const [isHovered, setIsHovered] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [dropPosition, setDropPosition] = React.useState<
    'before' | 'after' | 'inside' | null
  >(null);

  const saveFolder = useUpdateFolder();
  const deleteFolder = useDeleteFolder();
  const toggleExpansion = useToggleFolderExpansion();
  const duplicateFolder = useDuplicateFolder();
  const createFolder = useCreateFolder();

  const saveDoc = useSaveDocument(doc.id);
  const deleteDoc = useDeleteDocument();
  const duplicateDoc = useDuplicateDocument();
  const createDoc = useCreateDocument();
  const moveFolder = useMoveFolder();
  const moveDoc = useMoveDocument();
  const moveWorkflow = useMoveWorkflow();
  const deleteWorkflow = useDeleteWorkflow();
  const duplicateWorkflow = useDuplicateWorkflow();
  const updateWorkflowHook = useUpdateWorkflow();

  const canEdit =
    userRole === 'owner' || userRole === 'admin' || userRole === 'member';
  const canDelete = userRole === 'owner' || userRole === 'admin';

  const hasChildren = doc.children && doc.children.length > 0;
  const isFolder = doc.is_folder;
  const isWorkflow = doc.is_workflow;

  // Count total nested documents for deletion warning
  const countNestedDocs = React.useCallback((node: DocumentNode): number => {
    let count = 1; // Count self
    if (node.children) {
      node.children.forEach((child) => {
        count += countNestedDocs(child);
      });
    }
    return count;
  }, []);

  const nestedCount = React.useMemo(
    () => countNestedDocs(doc) - 1,
    [doc, countNestedDocs]
  );

  const handleDragStart = (e: React.DragEvent) => {
    if (!canEdit) return;

    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({
        docId: doc.id,
        parentId: doc.parent_id,
        position: doc.position,
        isFolder: isFolder,
        isWorkflow: isWorkflow,
        isPrivate: doc.is_private,  // NEW
      })
    );
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    onDragEnd?.();
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!canEdit) return;

    e.preventDefault();
    e.stopPropagation();

    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const x = e.clientX - rect.left;
    const height = rect.height;

    // Only folders can accept drops as children
    const canDropAsChild = isFolder;
    const isLeftSide = x < rect.width * 0.4;

    if (y < height * 0.3 && isLeftSide) {
      setDropPosition('before');
    } else if (y > height * 0.7 && isLeftSide) {
      setDropPosition('after');
    } else if (canDropAsChild) {
      setDropPosition('inside');
    } else {
      // If not a folder, default to after
      setDropPosition('after');
    }

    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only reset if leaving the entire item, not when entering a child
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
      setDropPosition(null);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setIsDragOver(false);
    setDropPosition(null);

    if (!canEdit || !selectedProjectId) return;

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      const draggedDocId = data.docId;
      const draggedIsFolder = data.isFolder;
      const draggedIsWorkflow = data.isWorkflow;
      const draggedIsPrivate = data.isPrivate;

      // Don't allow dropping on self or descendants
      if (draggedDocId === doc.id) return;

      let newParentId: string | null = null;
      let newPosition: number | undefined = undefined;

      if (dropPosition === 'inside' && isFolder) {
        // Only allow drop as child if this is a folder
        newParentId = doc.id;
        newPosition = 0;

        // Auto-expand folder if not already
        if (!doc.is_expanded) {
          await toggleExpansion.mutateAsync({
            folderId: doc.id, // CHANGED: Use folderId
            isExpanded: true,
          });
        }
      } else if (dropPosition === 'before') {
        newParentId = doc.parent_id;
        newPosition = doc.position;
      } else if (dropPosition === 'after') {
        newParentId = doc.parent_id;
        newPosition = doc.position + 1;
      }

      // NEW: Determine target privacy based on section
      const targetIsPrivate = isPrivateSection ?? doc.is_private;

      if (draggedIsFolder) {
        // Move folder
        await moveFolder.mutateAsync({
          folderId: draggedDocId,
          parentId: newParentId,
          position: newPosition,
          projectId: selectedProjectId,
          isPrivate: targetIsPrivate,  // NEW
        });
      } else if (draggedIsWorkflow) {
        await moveWorkflow.mutateAsync({
          workflowId: draggedDocId,
          parentId: newParentId,
          position: newPosition,
          projectId: selectedProjectId,
          isPrivate: targetIsPrivate,  // NEW
        });
      } else {
        // Move document
        await moveDoc.mutateAsync({
          docId: draggedDocId,
          parentId: newParentId,
          position: newPosition,
          projectId: selectedProjectId,
          isPrivate: targetIsPrivate,  // NEW
        });
      }
    } catch (error) {
      console.error('Failed to move item:', error);
    }
  };

  // Determine icon based on type
  const getDocumentIcon = () => {
    if (doc.icon)
      return <span className="text-base flex-shrink-0">{doc.icon}</span>;
    if (isFolder) {
      return doc.is_expanded ? (
        <IconFolderOpen className="size-3.5 flex-shrink-0 opacity-70" />
      ) : (
        <IconFolder className="size-3.5 flex-shrink-0 opacity-70" />
      );
    }
    if (isWorkflow) {
      return <IconTimeline className="size-3.5 flex-shrink-0 opacity-70" />;
    }
    return (
      <IconFileDescription className="size-3.5 flex-shrink-0 opacity-70" />
    );
  };

  // Build correct href based on document type
  const targetHref = React.useMemo(() => {
    if (isFolder) {
      // Don't navigate anywhere for folders, they just expand/collapse
      return '#';
    } else if (isWorkflow) {
      // This id must match the workflow id used by the API
      return `/workflow/${doc.id}`;
    } else {
      return `/editor/${doc.id}`;
    }
  }, [isFolder, isWorkflow, doc.id]);

  return (
    <>
      <SidebarMenuItem>
        <div
          className={cn(
            'flex items-center group/item relative transition-all h-7 rounded-md mx-1 hover:bg-sidebar-accent',
            isDragging && 'opacity-50'
          )}
          data-testid="folder-row"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          draggable={canEdit}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Drop indicator line for before/after */}
          {isDragOver && dropPosition === 'before' && (
            <div
              className="absolute -top-[1px] left-0 right-0 h-0.5 bg-primary pointer-events-none z-50"
              style={{ left: `${level * 12}px` }}
            >
              <div className="absolute -left-1 -top-1 size-2 rounded-full bg-primary" />
            </div>
          )}
          {isDragOver && dropPosition === 'after' && (
            <div
              className="absolute -bottom-[1px] left-0 right-0 h-0.5 bg-primary pointer-events-none z-50"
              style={{ left: `${level * 12}px` }}
            >
              <div className="absolute -left-1 -top-1 size-2 rounded-full bg-primary" />
            </div>
          )}

          {/* Highlight for dropping inside (only for folders) */}
          <div
            className={cn(
              'absolute inset-0 pointer-events-none rounded transition-colors',
              isDragOver &&
                dropPosition === 'inside' &&
                isFolder &&
                'bg-primary/10 ring-1 ring-primary/50'
            )}
          />

          {/* Expand/collapse button - visible for folders and documents with children */}
          <button
            className={cn(
              'flex items-center justify-center size-5 rounded-sm transition-all flex-shrink-0 ml-0.5 outline-none',
              'hover:bg-sidebar-accent-foreground/10',
              isFolder || hasChildren
                ? isHovered || doc.is_expanded
                  ? 'opacity-100'
                  : 'opacity-60'
                : 'opacity-0 pointer-events-none'
            )}
            onClick={(e) => {
              e.stopPropagation();
              if (isFolder || hasChildren) {
                toggleExpansion.mutate({
                  folderId: doc.id,
                  isExpanded: !doc.is_expanded,
                });
              }
            }}
          >
            {(isFolder || hasChildren) &&
              (doc.is_expanded ? (
                <IconChevronDown className="size-3" />
              ) : (
                <IconChevronRight className="size-3" />
              ))}
          </button>

          <SidebarMenuButton
            asChild={!isFolder}
            className={cn(
              'flex-1 h-7 px-1.5 hover:bg-transparent',
              level > 0 && 'text-sm'
            )}
            onClick={(e) => {
              if (isFolder) {
                e.preventDefault();
                toggleExpansion.mutate({
                  folderId: doc.id,
                  isExpanded: !doc.is_expanded,
                });
              }
            }}
          >
            {isFolder ? (
              <div className="flex items-center gap-1">
                {doc.icon ? (
                  <span className="text-base flex-shrink-0">{doc.icon}</span>
                ) : doc.is_expanded ? (
                  <IconFolderOpen className="size-3.5 flex-shrink-0 opacity-70" />
                ) : (
                  <IconFolder className="size-3.5 flex-shrink-0 opacity-70" />
                )}
                <span className="truncate">{doc.name || 'Untitled'}</span>
              </div>
            ) : (
              <Link to={isWorkflow ? `/workflow/${doc.id}` : `/editor/${doc.id}`} className="flex items-center gap-1">
                {isWorkflow ? (
                  <IconPlayerPlay className="size-3.5 flex-shrink-0 opacity-70" />
                ) : (
                  <IconFileDescription className="size-3.5 flex-shrink-0 opacity-70" />
                )}
                <span className="truncate">{doc.name || 'Untitled'}</span>
              </Link>
            )}
          </SidebarMenuButton>

          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    'rounded-sm size-5 mr-1 flex items-center justify-center hover:bg-sidebar-accent-foreground/10 data-[state=open]:bg-sidebar-accent-foreground/15 outline-none',
                    isHovered ? 'opacity-100' : 'opacity-0'
                  )}
                  data-testid="folder-menu-button"
                >
                  <IconDots className="size-4" />
                  <span className="sr-only">More</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-48 rounded-lg"
                side="right"
                align="start"
              >
                <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                  <IconEdit className="mr-2 size-4" />
                  Rename
                </DropdownMenuItem>

                {/* NEW: Move to Shared/Private option */}
                <DropdownMenuItem
                  onSelect={async () => {
                    if (!selectedProjectId) return;
                    const newIsPrivate = !doc.is_private;
                    
                    if (isFolder) {
                      await moveFolder.mutateAsync({
                        folderId: doc.id,
                        parentId: null,  // Move to root of target section
                        projectId: selectedProjectId,
                        isPrivate: newIsPrivate,
                      });
                    } else if (isWorkflow) {
                      await moveWorkflow.mutateAsync({
                        workflowId: doc.id,
                        parentId: null,
                        projectId: selectedProjectId,
                        isPrivate: newIsPrivate,
                      });
                    } else {
                      await moveDoc.mutateAsync({
                        docId: doc.id,
                        parentId: null,
                        projectId: selectedProjectId,
                        isPrivate: newIsPrivate,
                      });
                    }
                  }}
                >
                  {doc.is_private ? (
                    <>
                      <IconWorld className="mr-2 size-4" />
                      Move to Shared
                    </>
                  ) : (
                    <>
                      <IconLock className="mr-2 size-4" />
                      Move to Private
                    </>
                  )}
                </DropdownMenuItem>

                {isFolder && (
                  <>
                    <DropdownMenuItem
                      onSelect={() => {
                        setChildType('folder');
                        setCreateChildOpen(true);
                      }}
                    >
                      <IconFolder className="mr-2 size-4" />
                      New Subfolder
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        setChildType('document');
                        setCreateChildOpen(true);
                      }}
                    >
                      <IconFileDescription className="mr-2 size-4" />
                      New Page
                    </DropdownMenuItem>
                  </>
                )}

                <DropdownMenuItem
                  onSelect={() => {
                    if (isFolder) {
                      duplicateFolder.mutate({
                        folderId: doc.id,
                        includeChildren: false,
                      });
                    } else if (isWorkflow) {
                      if (!selectedProjectId) return;
                      duplicateWorkflow.mutate({
                        workflowId: doc.id,
                        projectId: selectedProjectId,
                      });
                    } else {
                      duplicateDoc.mutate({
                        docId: doc.id,
                        includeChildren: false,
                      });
                    }
                  }}
                >
                  <IconCopy className="mr-2 size-4" />
                  Duplicate
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                {canDelete && (
                  <DropdownMenuItem
                    onSelect={() => setDeleteOpen(true)}
                    className="text-destructive"
                  >
                    <IconTrash className="mr-2 size-4" />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Render children recursively */}
        {(isFolder || hasChildren) && doc.is_expanded && (
          <div
            className={cn(
              'ml-3 pl-1',
              level >= 2 && 'ml-2'
            )}
          >
            {doc.children.map((child) => (
              <NavPageItem
                key={child.id}
                doc={child}
                userRole={userRole}
                level={level + 1}
                onDragEnd={onDragEnd}
                isPrivateSection={isPrivateSection}  // NEW: Pass down
              />
            ))}
          </div>
        )}
      </SidebarMenuItem>

      {/* Create Child Dialog */}
      {isFolder && (
        <Dialog open={createChildOpen} onOpenChange={setCreateChildOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Add{' '}
                {childType === 'folder'
                  ? 'Subfolder'
                  : childType === 'workflow'
                  ? 'Workflow'
                  : 'Page'}
              </DialogTitle>
              <DialogDescription>
                Create a new{' '}
                {childType === 'folder'
                  ? 'subfolder'
                  : childType === 'workflow'
                  ? 'workflow'
                  : 'page'}{' '}
                in "{doc.name || 'Untitled'}"
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <label htmlFor="title" className="text-sm font-medium">
                  Name
                </label>
                <Input
                  id="title"
                  value={childTitle}
                  onChange={(e) => setChildTitle(e.target.value)}
                  placeholder={`${
                    childType === 'folder'
                      ? 'Subfolder'
                      : childType === 'workflow'
                      ? 'Workflow'
                      : 'Page'
                  } name`}
                  autoFocus
                />
              </div>
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button
                onClick={async () => {
                  if (selectedProjectId) {
                    if (childType === 'folder') {
                      await createFolder.mutateAsync({
                        name: childTitle.trim() || 'Untitled',
                        projectId: selectedProjectId,
                        parentId: doc.id,
                        isPrivate: doc.is_private,  // NEW: Inherit privacy from parent folder
                      });
                    } else {
                      await createDoc.mutateAsync({
                        title: childTitle.trim() || 'Untitled',
                        projectId: selectedProjectId,
                        folderId: doc.id,
                        isPrivate: doc.is_private,  // NEW: Inherit privacy from parent folder
                      });
                    }
                    setChildTitle('');
                    setChildType('document');
                    setCreateChildOpen(false);
                    // Auto-expand parent
                    if (!doc.is_expanded) {
                      await toggleExpansion.mutate({
                        folderId: doc.id,
                        isExpanded: true,
                      });
                    }
                  }
                }}
                disabled={!childTitle.trim()}
              >
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Rename Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Edit{' '}
              {isFolder ? 'Folder' : isWorkflow ? 'Workflow' : 'Page'}
            </DialogTitle>
            <DialogDescription>
              Update the{' '}
              {isFolder ? 'folder' : isWorkflow ? 'workflow' : 'page'} name.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={`${
                isFolder ? 'Folder' : isWorkflow ? 'Workflow' : 'Page'
              } name`}
            />
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={async () => {
                if (isFolder) {
                  await saveFolder.mutateAsync({
                    folderId: doc.id,
                    name: newTitle.trim(),
                  });
                } else if (isWorkflow) {
                  // NEW: send rename request for workflow
                  await updateWorkflowHook.mutateAsync({
                    workflowId: doc.id,
                    name: newTitle.trim(),
                  });
                } else {
                  await saveDoc.mutateAsync({ name: newTitle.trim() });
                }
                setEditOpen(false);
              }}
              disabled={
                !newTitle.trim() || newTitle.trim() === (doc.name || 'Untitled')
              }
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent  className="w-[calc(100vw-2rem)] sm:max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>
              Delete{' '}
              {isFolder ? 'Folder' : isWorkflow ? 'Workflow' : 'Page'}
            </DialogTitle>
            <DialogDescription>
              {hasChildren && !isWorkflow ? (
                <>
                  This {isFolder ? 'folder' : 'item'} contains {nestedCount}{' '}
                  nested {nestedCount === 1 ? 'item' : 'items'}.
                  <br />
                  <strong className="text-destructive">
                    All nested items will be deleted.
                  </strong>
                  <br />
                  This action cannot be undone.
                </>
              ) : (
                `Are you sure you want to delete this ${
                  isFolder ? 'folder' : isWorkflow ? 'workflow' : 'page'
                }? This action cannot be undone.`
              )}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  if (isFolder) {
                    await deleteFolder.mutateAsync({
                      folderId: doc.id,
                      projectId: selectedProjectId!,
                    });
                  } else if (isWorkflow) {
                    await deleteWorkflow.mutateAsync({
                      workflowId: doc.id,
                      projectId: selectedProjectId!,
                    });
                  } else {
                    await deleteDoc.mutateAsync({
                      docId: doc.id,
                      projectId: selectedProjectId!,
                    });
                  }
                  setDeleteOpen(false);
                  if (window.location.pathname.includes(doc.id)) {
                    navigate('/');
                  }
                } catch (error) {
                  console.error('Failed to delete:', error);
                }
              }}
            >
              {hasChildren && !isWorkflow
                ? `Delete ${nestedCount + 1} Items`
                : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function NavPages({ userRole }: { userRole: string }) {
  const { selectedProjectId } = useProject();
  
  // NEW: Fetch shared and private trees separately
  const { data: sharedTree = [], isLoading: sharedLoading } = useFolderTree(selectedProjectId, false);
  const { data: privateTree = [], isLoading: privateLoading } = useFolderTree(selectedProjectId, true);
  
  const createFolder = useCreateFolder();
  const moveFolder = useMoveFolder();
  const moveDoc = useMoveDocument();
  const moveWorkflow = useMoveWorkflow();

  const [dragCounter, setDragCounter] = React.useState(0);
  const [isDraggingOverShared, setIsDraggingOverShared] = React.useState(false);
  const [isDraggingOverPrivate, setIsDraggingOverPrivate] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [createIsPrivate, setCreateIsPrivate] = React.useState(false);  // NEW

  const canCreatePage =
    userRole === 'owner' || userRole === 'admin' || userRole === 'editor';

  const handleDragEnd = () => {
    setDragCounter((c) => c + 1);
  };

  // NEW: Handler for dropping into shared section
  const handleSharedDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverShared(false);

    if (!canCreatePage || !selectedProjectId) return;

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      const draggedDocId = data.docId;
      const draggedIsFolder = data.isFolder;
      const draggedIsWorkflow = data.isWorkflow;

      if (draggedIsFolder) {
        await moveFolder.mutateAsync({
          folderId: draggedDocId,
          parentId: null,
          position: sharedTree.length,
          projectId: selectedProjectId,
          isPrivate: false,  // Move to shared
        });
      } else if (draggedIsWorkflow) {
        await moveWorkflow.mutateAsync({
          workflowId: draggedDocId,
          parentId: null,
          position: sharedTree.length,
          projectId: selectedProjectId,
          isPrivate: false,
        });
      } else {
        await moveDoc.mutateAsync({
          docId: draggedDocId,
          parentId: null,
          position: sharedTree.length,
          projectId: selectedProjectId,
          isPrivate: false,
        });
      }
    } catch (error) {
      console.error('Failed to move item to shared:', error);
    }
  };

  // NEW: Handler for dropping into private section
  const handlePrivateDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverPrivate(false);

    if (!canCreatePage || !selectedProjectId) return;

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      const draggedDocId = data.docId;
      const draggedIsFolder = data.isFolder;
      const draggedIsWorkflow = data.isWorkflow;

      if (draggedIsFolder) {
        await moveFolder.mutateAsync({
          folderId: draggedDocId,
          parentId: null,
          position: privateTree.length,
          projectId: selectedProjectId,
          isPrivate: true,  // Move to private
        });
      } else if (draggedIsWorkflow) {
        await moveWorkflow.mutateAsync({
          workflowId: draggedDocId,
          parentId: null,
          position: privateTree.length,
          projectId: selectedProjectId,
          isPrivate: true,
        });
      } else {
        await moveDoc.mutateAsync({
          docId: draggedDocId,
          parentId: null,
          position: privateTree.length,
          projectId: selectedProjectId,
          isPrivate: true,
        });
      }
    } catch (error) {
      console.error('Failed to move item to private:', error);
    }
  };

  const isLoading = sharedLoading || privateLoading;

  if (isLoading) {
    return (
      <SidebarGroup>
        <SidebarGroupLabel>Pages</SidebarGroupLabel>
        <div className="px-3 py-2 text-sm text-muted-foreground">
          Loading...
        </div>
      </SidebarGroup>
    );
  }

  return (
    <>
      {/* Gallery View Links */}
      <SidebarGroup className="py-2">
        <SidebarMenu className="gap-0.5">
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link to="/documents/pages" className="flex items-center gap-2 h-7 px-2">
                <IconFileDescription className="size-3.5 opacity-70" />
                <span className="text-sm">Pages</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link to="/documents/workflows" className="flex items-center gap-2 h-7 px-2">
                <IconPlayerPlay className="size-3.5 opacity-70" />
                <span className="text-sm">Workflows</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link to="/documents/all" className="flex items-center gap-2 h-7 px-2">
                <IconFiles className="size-3.5 opacity-70" />
                <span className="text-sm">All Documents</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>

      {/* NEW: Shared Section */}
      <SidebarGroup
        className="py-2"
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingOverShared(true);
        }}
        onDragLeave={() => setIsDraggingOverShared(false)}
        onDrop={handleSharedDrop}
      >
        <SidebarGroupLabel className="px-2 py-1 text-xs flex items-center gap-1">
          <IconWorld className="size-3" />
          Shared
        </SidebarGroupLabel>
        <SidebarMenu
          className={cn(
            'gap-0.5 relative transition-colors',
            isDraggingOverShared && 'bg-primary/5 rounded'
          )}
          key={`shared-${dragCounter}`}
        >
          {sharedTree.map((doc) => (
            <NavPageItem
              key={doc.id}
              doc={doc}
              userRole={userRole}
              onDragEnd={handleDragEnd}
              isPrivateSection={false}
            />
          ))}

          {isDraggingOverShared && (
            <div className="h-8 mx-2 border-2 border-dashed border-primary/50 rounded-md flex items-center justify-center">
              <span className="text-xs text-muted-foreground">
                Drop here to make shared
              </span>
            </div>
          )}

          {canCreatePage && (
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => {
                  setCreateIsPrivate(false);
                  setOpen(true);
                }}
                className="h-7 px-2 text-gray-400"
              >
                <IconPlus className="mr-2 size-3.5" />
                <span className="text-sm">New Shared Folder</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarGroup>

      {/* NEW: Private Section — only show when there are private items or user can create */}
      {(privateTree.length > 0 || canCreatePage) && (
      <SidebarGroup
        className="py-2"
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingOverPrivate(true);
        }}
        onDragLeave={() => setIsDraggingOverPrivate(false)}
        onDrop={handlePrivateDrop}
      >
        <SidebarGroupLabel className="px-2 py-1 text-xs flex items-center gap-1">
          <IconLock className="size-3" />
          Private
        </SidebarGroupLabel>
        <SidebarMenu
          className={cn(
            'gap-0.5 relative transition-colors',
            isDraggingOverPrivate && 'bg-primary/5 rounded'
          )}
          key={`private-${dragCounter}`}
        >
          {privateTree.map((doc) => (
            <NavPageItem
              key={doc.id}
              doc={doc}
              userRole={userRole}
              onDragEnd={handleDragEnd}
              isPrivateSection={true}
            />
          ))}

          {isDraggingOverPrivate && (
            <div className="h-8 mx-2 border-2 border-dashed border-primary/50 rounded-md flex items-center justify-center">
              <span className="text-xs text-muted-foreground">
                Drop here to make private
              </span>
            </div>
          )}

          {canCreatePage && (
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => {
                  setCreateIsPrivate(true);
                  setOpen(true);
                }}
                className="h-7 px-2  text-gray-400"
              >
                <IconPlus className="mr-2 size-3.5" />
                <span className="text-sm">New Private Folder</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarGroup>
      )}

      {/* Create Folder dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Create {createIsPrivate ? 'Private' : 'Shared'} Folder
            </DialogTitle>
            <DialogDescription>
              Enter a name for the new {createIsPrivate ? 'private' : 'shared'} folder.
              {createIsPrivate
                ? ' Only you will be able to see this folder.'
                : ' All project members will be able to see this folder.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <label htmlFor="name" className="text-sm font-medium">
                Name
              </label>
              <Input
                id="name"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Folder name"
                autoFocus
              />
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={async () => {
                if (selectedProjectId) {
                  await createFolder.mutateAsync({
                    name: title.trim() || 'Untitled',
                    projectId: selectedProjectId,
                    parentId: undefined,
                    isPrivate: createIsPrivate,  // NEW
                  });
                  setTitle('');
                  setOpen(false);
                }
              }}
              disabled={!title.trim()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
