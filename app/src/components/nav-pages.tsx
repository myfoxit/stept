import { ChevronDown, ChevronRight, ClipboardCheck, Copy, File, FileText, Files, Folder, FolderOpen, FolderPlus, Globe, Inbox, LayoutGrid, Lock, Monitor, MoreHorizontal, Move, Pencil, Play, Plus, Share2, Trash2 } from 'lucide-react';
import * as React from "react";
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
  SidebarSeparator,
} from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, useNavigate, useLocation } from "react-router-dom";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useProject } from "@/providers/project-provider";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  useSaveDocument,
  useDeleteDocument,
  useDuplicateDocument,
  useCreateDocument,
  useMoveDocument,
} from "@/hooks/api/documents";
import {
  useUpdateFolder,
  useDeleteFolder,
  useToggleFolderExpansion,
  useDuplicateFolder,
  useCreateFolder,
  useMoveFolder,
  useFolderTree,
} from "@/hooks/api/folders";
import {
  useMoveWorkflow,
  useDeleteWorkflow,
  useDuplicateWorkflow,
} from "@/hooks/api/workflows";
import { useUpdateWorkflow } from "@/hooks/api/workflows";

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
  is_private: boolean; // NEW
  owner_id?: string | null; // NEW
  children: DocumentNode[];
}

function NavPageItem({
  doc,
  userRole,
  level = 0,
  onDragEnd,
  isPrivateSection, // NEW: Track which section we're in
}: {
  doc: DocumentNode;
  userRole: string;
  level?: number;
  onDragEnd?: () => void;
  isPrivateSection?: boolean; // NEW
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedProjectId } = useProject();
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [newTitle, setNewTitle] = React.useState(doc.name || "Untitled");
  const [createChildOpen, setCreateChildOpen] = React.useState(false);
  const [childTitle, setChildTitle] = React.useState("");
  const [childType, setChildType] = React.useState<"folder" | "document">(
    "document",
  );
  const [isHovered, setIsHovered] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [dropPosition, setDropPosition] = React.useState<
    "before" | "after" | "inside" | null
  >(null);
  const dragOverThrottleRef = React.useRef(0);

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
    userRole === "owner" || userRole === "admin" || userRole === "member";
  const canDelete = userRole === "owner" || userRole === "admin";

  const hasChildren = doc.children && doc.children.length > 0;
  const isFolder = doc.is_folder;
  const isWorkflow = doc.is_workflow;

  // Active state: check if current URL matches this item
  const isActive = React.useMemo(() => {
    if (isFolder) return false;
    if (isWorkflow) return location.pathname === `/workflow/${doc.id}`;
    return location.pathname === `/editor/${doc.id}`;
  }, [isFolder, isWorkflow, doc.id, location.pathname]);

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
    [doc, countNestedDocs],
  );

  const handleDragStart = (e: React.DragEvent) => {
    if (!canEdit) return;

    setIsDragging(true);
    e.dataTransfer.effectAllowed = "move";

    // Set a proper drag image to reduce Chrome edge-snap triggers
    const el = e.currentTarget as HTMLElement;
    const clone = el.cloneNode(true) as HTMLElement;
    clone.style.width = `${el.offsetWidth}px`;
    clone.style.position = "absolute";
    clone.style.top = "-9999px";
    clone.style.opacity = "0.8";
    document.body.appendChild(clone);
    e.dataTransfer.setDragImage(clone, 10, 10);
    requestAnimationFrame(() => document.body.removeChild(clone));

    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({
        docId: doc.id,
        parentId: doc.parent_id,
        position: doc.position,
        isFolder: isFolder,
        isWorkflow: isWorkflow,
        isPrivate: doc.is_private,
      }),
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

    // Throttle to reduce re-renders during drag
    const now = Date.now();
    if (now - dragOverThrottleRef.current < 50) return;
    dragOverThrottleRef.current = now;

    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;

    let newPos: "before" | "after" | "inside";
    if (y < height * 0.25) {
      newPos = "before";
    } else if (y > height * 0.75) {
      newPos = "after";
    } else if (isFolder) {
      newPos = "inside";
    } else {
      newPos = "after";
    }

    // Only update state if changed
    if (newPos !== dropPosition) setDropPosition(newPos);
    if (!isDragOver) setIsDragOver(true);
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
      const data = JSON.parse(e.dataTransfer.getData("application/json"));
      const draggedDocId = data.docId;
      const draggedIsFolder = data.isFolder;
      const draggedIsWorkflow = data.isWorkflow;
      const draggedIsPrivate = data.isPrivate;

      // Don't allow dropping on self or descendants
      if (draggedDocId === doc.id) return;

      let newParentId: string | null = null;
      let newPosition: number | undefined = undefined;

      if (dropPosition === "inside" && isFolder) {
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
      } else if (dropPosition === "before") {
        newParentId = doc.parent_id;
        newPosition = doc.position;
      } else if (dropPosition === "after") {
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
          isPrivate: targetIsPrivate, // NEW
        });
      } else if (draggedIsWorkflow) {
        await moveWorkflow.mutateAsync({
          workflowId: draggedDocId,
          parentId: newParentId,
          position: newPosition,
          projectId: selectedProjectId,
          isPrivate: targetIsPrivate, // NEW
        });
      } else {
        // Move document
        await moveDoc.mutateAsync({
          docId: draggedDocId,
          parentId: newParentId,
          position: newPosition,
          projectId: selectedProjectId,
          isPrivate: targetIsPrivate, // NEW
        });
      }
    } catch (error) {
      console.error("Failed to move item:", error);
    }
  };

  // Determine icon based on type
  const getDocumentIcon = () => {
    if (doc.icon)
      return <span className="text-base flex-shrink-0">{doc.icon}</span>;
    if (isFolder) {
      return doc.is_expanded ? (
        <FolderOpen
          className="size-3.5 flex-shrink-0 opacity-50"
          strokeWidth={1.5}
        />
      ) : (
        <Folder
          className="size-3.5 flex-shrink-0 opacity-50"
          strokeWidth={1.5}
        />
      );
    }
    if (isWorkflow) {
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v4m0 14v4m-9.66-7h4M17.66 12h4.34M4.22 4.22l2.83 2.83m9.9 9.9l2.83 2.83M4.22 19.78l2.83-2.83m9.9-9.9l2.83-2.83" />
        </svg>
      );
    }
    return (
      <File className="size-3.5 flex-shrink-0 opacity-50" strokeWidth={1.5} />
    );
  };

  // Build correct href based on document type
  const targetHref = React.useMemo(() => {
    if (isFolder) {
      // Don't navigate anywhere for folders, they just expand/collapse
      return "#";
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
            "flex items-center group/item relative transition-all h-7 rounded-md mx-1 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
            isDragging && "opacity-50",
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
          {isDragOver && dropPosition === "before" && (
            <div
              className="absolute -top-[1px] left-0 right-0 h-0.5 bg-primary pointer-events-none z-50"
              style={{ left: `${level * 12}px` }}
            >
              <div className="absolute -left-1 -top-1 size-2 rounded-full bg-primary" />
            </div>
          )}
          {isDragOver && dropPosition === "after" && (
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
              "absolute inset-0 pointer-events-none rounded transition-colors",
              isDragOver &&
                dropPosition === "inside" &&
                isFolder &&
                "bg-primary/10 ring-1 ring-primary/50",
            )}
          />

          {/* Expand/collapse button - visible for folders and documents with children */}
          <button
            className={cn(
              "flex items-center justify-center size-5 rounded-sm transition-all flex-shrink-0 ml-0.5 outline-none",
              "hover:bg-sidebar-accent-foreground/10",
              isFolder || hasChildren
                ? isHovered || doc.is_expanded
                  ? "opacity-100"
                  : "opacity-60"
                : "opacity-0 pointer-events-none",
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
                <ChevronDown className="size-3" />
              ) : (
                <ChevronRight className="size-3" />
              ))}
          </button>

          <SidebarMenuButton
            asChild={!isFolder}
            className={cn(
              "flex-1 h-7 px-1.5 hover:bg-transparent",
              level > 0 && "text-sm",
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
                  <FolderOpen
                    className="size-3.5 flex-shrink-0 opacity-50"
                    strokeWidth={1.5}
                  />
                ) : (
                  <Folder
                    className="size-3.5 flex-shrink-0 opacity-50"
                    strokeWidth={1.5}
                  />
                )}
                <span className="truncate font-semibold">
                  {doc.name || "Untitled"}
                </span>
              </div>
            ) : (
              <Link
                to={isWorkflow ? `/workflow/${doc.id}` : `/editor/${doc.id}`}
                className="flex items-center gap-1"
              >
                {isWorkflow ? (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 1v4m0 14v4m-9.66-7h4M17.66 12h4.34M4.22 4.22l2.83 2.83m9.9 9.9l2.83 2.83M4.22 19.78l2.83-2.83m9.9-9.9l2.83-2.83" />
                  </svg>
                ) : (
                  <File
                    className="size-3.5 flex-shrink-0 opacity-50"
                    strokeWidth={1.5}
                  />
                )}
                <span className="truncate">{doc.name || "Untitled"}</span>
              </Link>
            )}
          </SidebarMenuButton>

          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "rounded-sm size-5 mr-1 flex items-center justify-center hover:bg-sidebar-accent-foreground/10 data-[state=open]:bg-sidebar-accent-foreground/15 outline-none",
                    isHovered ? "opacity-100" : "opacity-0",
                  )}
                  data-testid="folder-menu-button"
                >
                  <MoreHorizontal className="size-4" />
                  <span className="sr-only">More</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-48 rounded-lg"
                side="right"
                align="start"
              >
                <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                  <Pencil className="mr-2 size-4" />
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
                        parentId: null, // Move to root of target section
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
                      <Globe className="mr-2 size-4" />
                      Move to Shared
                    </>
                  ) : (
                    <>
                      <Lock className="mr-2 size-4" />
                      Move to Private
                    </>
                  )}
                </DropdownMenuItem>

                {isFolder && (
                  <>
                    <DropdownMenuItem
                      onSelect={() => {
                        setChildType("folder");
                        setCreateChildOpen(true);
                      }}
                    >
                      <Folder className="mr-2 size-4" />
                      New Subfolder
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        setChildType("document");
                        setCreateChildOpen(true);
                      }}
                    >
                      <FileText className="mr-2 size-4" />
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
                  <Copy className="mr-2 size-4" />
                  Duplicate
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                {canDelete && (
                  <DropdownMenuItem
                    onSelect={() => setDeleteOpen(true)}
                    className="text-destructive"
                  >
                    <Trash2 className="mr-2 size-4" />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Render children recursively */}
        {(isFolder || hasChildren) && doc.is_expanded && (
          <div className={cn("ml-3 pl-1", level >= 2 && "ml-2")}>
            {doc.children.map((child) => (
              <NavPageItem
                key={child.id}
                doc={child}
                userRole={userRole}
                level={level + 1}
                onDragEnd={onDragEnd}
                isPrivateSection={isPrivateSection} // NEW: Pass down
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
                Add{" "}
                {childType === "folder"
                  ? "Subfolder"
                  : childType === "workflow"
                    ? "Workflow"
                    : "Page"}
              </DialogTitle>
              <DialogDescription>
                Create a new{" "}
                {childType === "folder"
                  ? "subfolder"
                  : childType === "workflow"
                    ? "workflow"
                    : "page"}{" "}
                in "{doc.name || "Untitled"}"
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
                    childType === "folder"
                      ? "Subfolder"
                      : childType === "workflow"
                        ? "Workflow"
                        : "Page"
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
                    if (childType === "folder") {
                      await createFolder.mutateAsync({
                        name: childTitle.trim() || "Untitled",
                        projectId: selectedProjectId,
                        parentId: doc.id,
                        isPrivate: doc.is_private, // NEW: Inherit privacy from parent folder
                      });
                    } else {
                      const newDoc = await createDoc.mutateAsync({
                        title: childTitle.trim() || "Untitled",
                        projectId: selectedProjectId,
                        folderId: doc.id,
                        isPrivate: doc.is_private,
                      });
                      navigate(`/editor/${newDoc.id}`);
                    }
                    setChildTitle("");
                    setChildType("document");
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
              Edit {isFolder ? "Folder" : isWorkflow ? "Workflow" : "Page"}
            </DialogTitle>
            <DialogDescription>
              Update the{" "}
              {isFolder ? "folder" : isWorkflow ? "workflow" : "page"} name.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={`${
                isFolder ? "Folder" : isWorkflow ? "Workflow" : "Page"
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
                !newTitle.trim() || newTitle.trim() === (doc.name || "Untitled")
              }
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>
              Delete {isFolder ? "Folder" : isWorkflow ? "Workflow" : "Page"}
            </DialogTitle>
            <DialogDescription>
              {hasChildren && !isWorkflow ? (
                <>
                  This {isFolder ? "folder" : "item"} contains {nestedCount}{" "}
                  nested {nestedCount === 1 ? "item" : "items"}.
                  <br />
                  <strong className="text-destructive">
                    All nested items will be deleted.
                  </strong>
                  <br />
                  This action cannot be undone.
                </>
              ) : (
                `Are you sure you want to delete this ${
                  isFolder ? "folder" : isWorkflow ? "workflow" : "page"
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
                  // Always navigate away after deletion to avoid 404
                  navigate("/");
                } catch (error) {
                  console.error("Failed to delete:", error);
                }
              }}
            >
              {hasChildren && !isWorkflow
                ? `Delete ${nestedCount + 1} Items`
                : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function NavPages({ userRole }: { userRole: string }) {
  const { selectedProjectId } = useProject();
  const location = useLocation();
  const navigate = useNavigate();

  // NEW: Fetch shared and private trees separately
  const { data: sharedTree = [], isLoading: sharedLoading } = useFolderTree(
    selectedProjectId,
    false,
  );
  const { data: privateTree = [], isLoading: privateLoading } = useFolderTree(
    selectedProjectId,
    true,
  );

  const createFolder = useCreateFolder();
  const createDoc = useCreateDocument();
  const moveFolder = useMoveFolder();
  const moveDoc = useMoveDocument();
  const moveWorkflow = useMoveWorkflow();

  const [dragCounter, setDragCounter] = React.useState(0);
  const [isDraggingOverShared, setIsDraggingOverShared] = React.useState(false);
  const [isDraggingOverPrivate, setIsDraggingOverPrivate] =
    React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [createIsPrivate, setCreateIsPrivate] = React.useState(false);
  const [unsortedSharedExpanded, setUnsortedSharedExpanded] =
    React.useState(true);
  const [unsortedPrivateExpanded, setUnsortedPrivateExpanded] =
    React.useState(true); // NEW

  const canCreatePage =
    userRole === "owner" || userRole === "admin" || userRole === "editor";

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
      const data = JSON.parse(e.dataTransfer.getData("application/json"));
      const draggedDocId = data.docId;
      const draggedIsFolder = data.isFolder;
      const draggedIsWorkflow = data.isWorkflow;

      if (draggedIsFolder) {
        await moveFolder.mutateAsync({
          folderId: draggedDocId,
          parentId: null,
          position: sharedTree.length,
          projectId: selectedProjectId,
          isPrivate: false, // Move to shared
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
      console.error("Failed to move item to shared:", error);
    }
  };

  // NEW: Handler for dropping into private section
  const handlePrivateDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverPrivate(false);

    if (!canCreatePage || !selectedProjectId) return;

    try {
      const data = JSON.parse(e.dataTransfer.getData("application/json"));
      const draggedDocId = data.docId;
      const draggedIsFolder = data.isFolder;
      const draggedIsWorkflow = data.isWorkflow;

      if (draggedIsFolder) {
        await moveFolder.mutateAsync({
          folderId: draggedDocId,
          parentId: null,
          position: privateTree.length,
          projectId: selectedProjectId,
          isPrivate: true, // Move to private
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
      console.error("Failed to move item to private:", error);
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
        <SidebarGroupLabel className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-[#D6D3D1]">
          Content
        </SidebarGroupLabel>
        <SidebarMenu className="gap-0.5">
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              data-active={
                location.pathname === "/documents/pages" || undefined
              }
            >
              <Link
                to="/documents/pages"
                className="flex items-center gap-2 h-7 px-2"
              >
                <File className="size-3.5 opacity-50" strokeWidth={1.5} />
                <span className="text-sm">Pages</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              data-active={
                location.pathname === "/documents/workflows" || undefined
              }
            >
              <Link
                to="/documents/workflows"
                className="flex items-center gap-2 h-7 px-2"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 1v4m0 14v4m-9.66-7h4M17.66 12h4.34M4.22 4.22l2.83 2.83m9.9 9.9l2.83 2.83M4.22 19.78l2.83-2.83m9.9-9.9l2.83-2.83" />
                </svg>

                <span className="text-sm">Workflows</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              data-active={location.pathname === "/documents/all" || undefined}
            >
              <Link
                to="/documents/all"
                className="flex items-center gap-2 h-7 px-2"
              >
                <Files className="size-3.5 opacity-50" strokeWidth={1.5} />
                <span className="text-sm">All Documents</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>

      <SidebarSeparator />

      {/* Shared Section */}
      <SidebarGroup
        className="py-2"
        onDragOver={(e) => {
          e.preventDefault();
          if (!isDraggingOverShared) setIsDraggingOverShared(true);
        }}
        onDragLeave={() => setIsDraggingOverShared(false)}
        onDrop={handleSharedDrop}
      >
        <SidebarGroupLabel className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-[#D6D3D1] flex items-center justify-between">
          <span>Shared</span>
          {canCreatePage && (
            <button
              onClick={() => {
                setCreateIsPrivate(false);
                setOpen(true);
              }}
              className="rounded-sm p-0.5 hover:bg-sidebar-accent transition-colors"
              title="New Folder"
            >
              <FolderPlus
                className="size-3.5 text-[#D6D3D1]"
                strokeWidth={1.5}
              />
            </button>
          )}
        </SidebarGroupLabel>
        <SidebarMenu
          className={cn(
            "gap-0.5 relative transition-colors",
            isDraggingOverShared && "bg-primary/5 rounded",
          )}
          key={`shared-${dragCounter}`}
        >
          {/* Folders first */}
          {sharedTree
            .filter((doc) => doc.is_folder)
            .map((doc) => (
              <NavPageItem
                key={doc.id}
                doc={doc}
                userRole={userRole}
                onDragEnd={handleDragEnd}
                isPrivateSection={false}
              />
            ))}

          {/* Unsorted: root-level non-folder items (always visible) */}
          <SidebarMenuItem>
            <div
              className="flex items-center group/item h-7 rounded-md mx-1 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
              onClick={() => setUnsortedSharedExpanded(!unsortedSharedExpanded)}
            >
              <button className="flex items-center justify-center size-5 rounded-sm ml-0.5 outline-none">
                {unsortedSharedExpanded ? (
                  <ChevronDown className="size-3" />
                ) : (
                  <ChevronRight className="size-3" />
                )}
              </button>
              <SidebarMenuButton className="flex-1 h-7 px-1.5 hover:bg-transparent">
                <Inbox
                  className="size-3.5 flex-shrink-0 opacity-50"
                  strokeWidth={1.5}
                />
                <span className="truncate text-sm font-semibold">Unsorted</span>
              </SidebarMenuButton>
              {canCreatePage && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="rounded-sm size-5 mr-1 flex items-center justify-center hover:bg-sidebar-accent-foreground/10 opacity-0 group-hover/item:opacity-100 outline-none"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side="right"
                    align="start"
                    className="w-44"
                  >
                    <DropdownMenuItem
                      onSelect={async () => {
                        if (!selectedProjectId) return;
                        const newDoc = await createDoc.mutateAsync({
                          title: "Untitled",
                          projectId: selectedProjectId,
                          isPrivate: false,
                        });
                        navigate(`/editor/${newDoc.id}`);
                      }}
                    >
                      <FileText className="mr-2 size-4" />
                      New Page
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </SidebarMenuItem>
          {unsortedSharedExpanded && (
            <div className="ml-3 pl-1">
              {sharedTree
                .filter((doc) => !doc.is_folder)
                .map((doc) => (
                  <NavPageItem
                    key={doc.id}
                    doc={doc}
                    userRole={userRole}
                    onDragEnd={handleDragEnd}
                    isPrivateSection={false}
                  />
                ))}
            </div>
          )}

          {isDraggingOverShared && (
            <div className="h-8 mx-2 border-2 border-dashed border-primary/50 rounded-md flex items-center justify-center">
              <span className="text-xs text-muted-foreground">
                Drop here to make shared
              </span>
            </div>
          )}
        </SidebarMenu>
      </SidebarGroup>

      <SidebarSeparator />

      {/* Private Section */}
      {(privateTree.length > 0 || canCreatePage) && (
        <SidebarGroup
          className="py-2"
          onDragOver={(e) => {
            e.preventDefault();
            if (!isDraggingOverPrivate) setIsDraggingOverPrivate(true);
          }}
          onDragLeave={() => setIsDraggingOverPrivate(false)}
          onDrop={handlePrivateDrop}
        >
          <SidebarGroupLabel className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-[#D6D3D1] flex items-center justify-between">
            <span>Private</span>
            {canCreatePage && (
              <button
                onClick={() => {
                  setCreateIsPrivate(true);
                  setOpen(true);
                }}
                className="rounded-sm p-0.5 hover:bg-sidebar-accent transition-colors"
                title="New Folder"
              >
                <FolderPlus
                  className="size-3.5 text-[#D6D3D1]"
                  strokeWidth={1.5}
                />
              </button>
            )}
          </SidebarGroupLabel>
          <SidebarMenu
            className={cn(
              "gap-0.5 relative transition-colors",
              isDraggingOverPrivate && "bg-primary/5 rounded",
            )}
            key={`private-${dragCounter}`}
          >
            {/* Folders first */}
            {privateTree
              .filter((doc) => doc.is_folder)
              .map((doc) => (
                <NavPageItem
                  key={doc.id}
                  doc={doc}
                  userRole={userRole}
                  onDragEnd={handleDragEnd}
                  isPrivateSection={true}
                />
              ))}

            {/* Unsorted: root-level non-folder items (always visible) */}
            <SidebarMenuItem>
              <div
                className="flex items-center group/item h-7 rounded-md mx-1 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
                onClick={() =>
                  setUnsortedPrivateExpanded(!unsortedPrivateExpanded)
                }
              >
                <button className="flex items-center justify-center size-5 rounded-sm ml-0.5 outline-none">
                  {unsortedPrivateExpanded ? (
                    <ChevronDown className="size-3" />
                  ) : (
                    <ChevronRight className="size-3" />
                  )}
                </button>
                <SidebarMenuButton className="flex-1 h-7 px-1.5 hover:bg-transparent">
                  <Inbox
                    className="size-3.5 flex-shrink-0 opacity-50"
                    strokeWidth={1.5}
                  />
                  <span className="truncate text-sm font-semibold">
                    Unsorted
                  </span>
                </SidebarMenuButton>
                {canCreatePage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="rounded-sm size-5 mr-1 flex items-center justify-center hover:bg-sidebar-accent-foreground/10 opacity-0 group-hover/item:opacity-100 outline-none"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      side="right"
                      align="start"
                      className="w-44"
                    >
                      <DropdownMenuItem
                        onSelect={async () => {
                          if (!selectedProjectId) return;
                          const newDoc = await createDoc.mutateAsync({
                            title: "Untitled",
                            projectId: selectedProjectId,
                            isPrivate: true,
                          });
                          navigate(`/editor/${newDoc.id}`);
                        }}
                      >
                        <FileText className="mr-2 size-4" />
                        New Page
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </SidebarMenuItem>
            {unsortedPrivateExpanded && (
              <div className="ml-3 pl-1">
                {privateTree
                  .filter((doc) => !doc.is_folder)
                  .map((doc) => (
                    <NavPageItem
                      key={doc.id}
                      doc={doc}
                      userRole={userRole}
                      onDragEnd={handleDragEnd}
                      isPrivateSection={true}
                    />
                  ))}
              </div>
            )}

            {isDraggingOverPrivate && (
              <div className="h-8 mx-2 border-2 border-dashed border-primary/50 rounded-md flex items-center justify-center">
                <span className="text-xs text-muted-foreground">
                  Drop here to make private
                </span>
              </div>
            )}
          </SidebarMenu>
        </SidebarGroup>
      )}

      {/* Create Folder dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Create {createIsPrivate ? "Private" : "Shared"} Folder
            </DialogTitle>
            <DialogDescription>
              Enter a name for the new {createIsPrivate ? "private" : "shared"}{" "}
              folder.
              {createIsPrivate
                ? " Only you will be able to see this folder."
                : " All project members will be able to see this folder."}
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
                    name: title.trim() || "Untitled",
                    projectId: selectedProjectId,
                    parentId: undefined,
                    isPrivate: createIsPrivate, // NEW
                  });
                  setTitle("");
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
