'use client';

import * as React from 'react';
import {
  IconDots,
  IconFolder,
  IconShare3,
  IconTrash,
  IconChevronRight,
  IconEdit,
  IconPlus, // ← added
  type Icon,
} from '@tabler/icons-react';
import { Link, useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  // DialogTrigger, // ← remove
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDropTable, useUpdateTable, useCreateTable } from '@/hooks/api/tables';



function NavDocumentItem({
  item,
  projectId,
  isMobile,
  isExpanded,
  onToggle,
  userRole,
}: {
  item: { name: string; url: string; urlKanban: string; icon: Icon };
  projectId: string;
  isMobile: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  userRole: string;
}) {
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = React.useState(false);
  const [newName, setNewName] = React.useState(item.name);
  const updateTable = useUpdateTable();
  const deleteTable = useDropTable();

  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const tableId = item.url.split('/').pop()!;

  const canEdit = userRole === 'owner' || userRole === 'admin' || userRole === 'member';
  const canDelete = userRole === 'owner' || userRole === 'admin';

  return (
    <>
      {/* table row in sidebar, with stable test id */}
      <SidebarMenuItem
        className="group/nav-doc-item"
        data-testid={`sidebar-table-item-${tableId}`}
      >
        {/* link to the table */}
        <SidebarMenuButton asChild>
          <Link to={item.url}>
            <item.icon />
            <span>{item.name}</span>
          </Link>
        </SidebarMenuButton>

        {/* right-side actions - only show if user can at least edit */}
        {canEdit && (
          <div className="flex items-center ml-auto space-x-8">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuAction
                  showOnHover
                  className="data-[state=open]:bg-accent rounded-sm"
                  data-testid={`sidebar-table-actions-${tableId}`}
                >
                  <IconDots />
                  <span className="sr-only">More</span>
                </SidebarMenuAction>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-24 rounded-lg"
                side={isMobile ? 'bottom' : 'right'}
                align={isMobile ? 'end' : 'start'}
              >
                <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                  <IconEdit />
                  <span>Edit</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <IconFolder />
                  <span>Open</span>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <IconShare3 />
                  <span>Share</span>
                </DropdownMenuItem>
                {canDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => setDeleteOpen(true)}
                      variant="destructive"
                      data-testid={`sidebar-table-delete-${tableId}`}
                    >
                      <IconTrash />
                      <span>Delete</span>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <SidebarMenuAction
              onClick={onToggle}
              className={`opacity-0 transition-transform group-hover/nav-doc-item:opacity-100 group-focus-within/nav-doc-item:opacity-100 ${
                isExpanded ? 'rotate-90' : ''
              }`}
            >
              <IconChevronRight />
              <span className="sr-only">Toggle views</span>
            </SidebarMenuAction>
          </div>
        )}
      </SidebarMenuItem>

      {/* Collapsible sub-items */}
      {isExpanded && (
        <>
          <SidebarMenuItem className="pl-8">
            <SidebarMenuButton className="px-2 py-1 text-sm font-medium hover:bg-muted rounded">
              + Create View
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem className="pl-8">
            <SidebarMenuButton
              asChild
              className="px-2 py-1 text-sm hover:bg-muted rounded"
            >
              <Link to={item.url}>Grid</Link>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem className="pl-8">
            <SidebarMenuButton
              asChild
              className="px-2 py-1 text-sm hover:bg-muted rounded"
            >
              <Link to={item.urlKanban}>Kanban</Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </>
      )}

      {/* Edit Table Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Edit Table</DialogTitle>
            <DialogDescription>Update the table name.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor={`edit-table-${tableId}`}>Table Name</Label>
              <Input
                id={`edit-table-${tableId}`}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={async () => {
                await updateTable.mutateAsync({
                  tableId,
                  name: newName,
                  projectId,
                });
                setEditOpen(false);
              }}
              disabled={!newName || newName === item.name}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent data-testid={`delete-table-dialog-${tableId}`}>
          <DialogHeader>
            <DialogTitle>Delete Table</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this table?
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={async () => {
                await deleteTable.mutateAsync({ tableId, projectId });
                setDeleteOpen(false);
                navigate('/');
              }}
              data-testid={`delete-table-confirm-${tableId}`}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function NavDocuments({
  items,
  projectId,
  userRole,
}: {
  items: {
    name: string;
    url: string;
    urlKanban: string;
    icon: Icon;
  }[];
  projectId: string;
  userRole: ProjectRole;
}) {
  const { isMobile } = useSidebar();
  const [expandedIndex, setExpandedIndex] = React.useState<number | null>(null);
  const toggle = (idx: number) =>
    setExpandedIndex(expandedIndex === idx ? null : idx);

  // Local state for creating a table
  const [createOpen, setCreateOpen] = React.useState(false);
  const [tableName, setTableName] = React.useState('');
  const createTableMutation = useCreateTable();

  const canCreateTable = userRole === 'owner' || userRole === 'admin' || userRole === 'member';

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Tables</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item, idx) => (
          <NavDocumentItem
            key={item.name}
            item={item}
            projectId={projectId}
            isMobile={isMobile}
            isExpanded={expandedIndex === idx}
            onToggle={() => toggle(idx)}
            userRole={userRole}
          />
        ))}

        {/* "Create Table" button - only show if user has permission */}
        {canCreateTable && (
          <SidebarMenuItem>
            <SidebarMenuButton   onClick={() => setCreateOpen(true)} className="h-7 px-2  text-gray-400">
             
                <IconPlus className="mr-2" />
                <span>Create Table</span>
             
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}

        <SidebarMenuItem>
          <SidebarMenuButton className="text-sidebar-foreground/70">
            <IconDots className="text-sidebar-foreground/70" />
            <span>More</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>

      {/* Create Table dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Table</DialogTitle>
            <DialogDescription>
              Define a name for your new table.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="tableName">Table Name</Label>
              <Input
                id="tableName"
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                placeholder="My Table"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={async () => {
                if (!projectId) return;
                await createTableMutation.mutateAsync({
                  project_id: projectId,
                  name: tableName,
                });
                setTableName('');
                setCreateOpen(false);
              }}
              disabled={!tableName || !projectId}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarGroup>
  );
}
