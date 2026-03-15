import * as React from 'react';
import { Database, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
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
import { useProject } from '@/providers/project-provider';
import {
  useTables,
  useCreateTable,
  useDropTable,
  useUpdateTable,
} from '@/hooks/api/tables';
import { toast } from 'sonner';

export function NavDatabases({ userRole }: { userRole: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedProjectId } = useProject();
  const { data: tables = [] } = useTables(selectedProjectId || '');
  const createTable = useCreateTable();
  const dropTable = useDropTable();
  const updateTable = useUpdateTable();

  const [renameOpen, setRenameOpen] = React.useState(false);
  const [renameId, setRenameId] = React.useState<string | null>(null);
  const [renameName, setRenameName] = React.useState('');
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);

  const canEdit = userRole === 'owner' || userRole === 'admin' || userRole === 'member';

  const handleCreate = async () => {
    if (!selectedProjectId) return;
    try {
      const table = await createTable.mutateAsync({
        name: 'Untitled Table',
        project_id: selectedProjectId,
      });
      navigate(`/table/${table.id}`);
    } catch {
      toast.error('Failed to create table');
    }
  };

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="flex items-center justify-between">
        <span>Tables</span>
        {canEdit && (
          <button
            type="button"
            onClick={handleCreate}
            className="p-0.5 rounded hover:bg-sidebar-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer bg-transparent border-none"
            title="New Table"
          >
            <Plus className="size-3.5" />
          </button>
        )}
      </SidebarGroupLabel>
      <SidebarMenu>
        {tables.map((table) => {
          const isActive = location.pathname === `/table/${table.id}`;
          return (
            <SidebarMenuItem key={table.id}>
              <SidebarMenuButton
                asChild
                isActive={isActive}
                className="gap-2"
              >
                <Link to={`/table/${table.id}`}>
                  <Database className="size-4 text-muted-foreground" />
                  <span className="truncate">{table.name}</span>
                </Link>
              </SidebarMenuButton>
              {canEdit && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuAction>
                      <MoreHorizontal className="size-4" />
                    </SidebarMenuAction>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="right" align="start">
                    <DropdownMenuItem
                      onClick={() => {
                        setRenameId(table.id);
                        setRenameName(table.name);
                        setRenameOpen(true);
                      }}
                    >
                      <Pencil className="size-4 mr-2" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => {
                        setDeleteId(table.id);
                        setDeleteOpen(true);
                      }}
                    >
                      <Trash2 className="size-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </SidebarMenuItem>
          );
        })}
        {tables.length === 0 && (
          <SidebarMenuItem>
            <span className="px-2 py-1 text-xs text-muted-foreground">No tables yet</span>
          </SidebarMenuItem>
        )}
      </SidebarMenu>

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={(o) => { setRenameOpen(o); if (!o) setRenameId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Table</DialogTitle>
            <DialogDescription>Update the table name.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              placeholder="Table name"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && renameId && renameName.trim() && selectedProjectId) {
                  updateTable.mutate(
                    { tableId: renameId, name: renameName.trim(), projectId: selectedProjectId },
                    { onSuccess: () => setRenameOpen(false), onError: () => toast.error('Failed to rename') }
                  );
                }
              }}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              disabled={!renameName.trim() || !renameId}
              onClick={() => {
                if (renameId && selectedProjectId) {
                  updateTable.mutate(
                    { tableId: renameId, name: renameName.trim(), projectId: selectedProjectId },
                    { onSuccess: () => setRenameOpen(false), onError: () => toast.error('Failed to rename') }
                  );
                }
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={deleteOpen} onOpenChange={(o) => { setDeleteOpen(o); if (!o) setDeleteId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Table</DialogTitle>
            <DialogDescription>
              This will permanently remove the table and all its data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={async () => {
                if (deleteId && selectedProjectId) {
                  try {
                    await dropTable.mutateAsync({ tableId: deleteId, projectId: selectedProjectId });
                    setDeleteOpen(false);
                    if (location.pathname === `/table/${deleteId}`) {
                      navigate('/');
                    }
                  } catch {
                    toast.error('Failed to delete table');
                  }
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarGroup>
  );
}
