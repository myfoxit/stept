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
  useDatabases,
  useCreateDatabase,
  useDeleteDatabase,
  useUpdateDatabase,
} from '@/hooks/api/databases';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function NavDatabases({ userRole }: { userRole: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedProjectId } = useProject();
  const { data: databases = [] } = useDatabases(selectedProjectId || undefined);
  const createDb = useCreateDatabase();
  const deleteDb = useDeleteDatabase();
  const updateDb = useUpdateDatabase();

  const [renameOpen, setRenameOpen] = React.useState(false);
  const [renameId, setRenameId] = React.useState<string | null>(null);
  const [renameName, setRenameName] = React.useState('');
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);

  const canEdit = userRole === 'owner' || userRole === 'admin' || userRole === 'member';

  const handleCreate = async () => {
    if (!selectedProjectId) return;
    try {
      const db = await createDb.mutateAsync({ projectId: selectedProjectId });
      navigate(`/database/${db.id}`);
    } catch {
      toast.error('Failed to create database');
    }
  };

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="flex items-center justify-between">
        <span>Databases</span>
        {canEdit && (
          <button
            type="button"
            onClick={handleCreate}
            className="p-0.5 rounded hover:bg-sidebar-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer bg-transparent border-none"
            title="New Database"
          >
            <Plus className="size-3.5" />
          </button>
        )}
      </SidebarGroupLabel>
      <SidebarMenu>
        {databases.map((db) => {
          const isActive = location.pathname === `/database/${db.id}`;
          return (
            <SidebarMenuItem key={db.id}>
              <SidebarMenuButton
                asChild
                isActive={isActive}
                className="gap-2"
              >
                <Link to={`/database/${db.id}`}>
                  <Database className="size-4 text-muted-foreground" />
                  <span className="truncate">{db.name}</span>
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
                        setRenameId(db.id);
                        setRenameName(db.name);
                        setRenameOpen(true);
                      }}
                    >
                      <Pencil className="size-4 mr-2" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => {
                        setDeleteId(db.id);
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
        {databases.length === 0 && (
          <SidebarMenuItem>
            <span className="px-2 py-1 text-xs text-muted-foreground">No databases yet</span>
          </SidebarMenuItem>
        )}
      </SidebarMenu>

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={(o) => { setRenameOpen(o); if (!o) setRenameId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Database</DialogTitle>
            <DialogDescription>Update the database name.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              placeholder="Database name"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && renameId && renameName.trim() && selectedProjectId) {
                  updateDb.mutate(
                    { databaseId: renameId, name: renameName.trim(), projectId: selectedProjectId },
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
                  updateDb.mutate(
                    { databaseId: renameId, name: renameName.trim(), projectId: selectedProjectId },
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
            <DialogTitle>Delete Database</DialogTitle>
            <DialogDescription>
              This will permanently remove the database and all its data. This action cannot be undone.
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
                    await deleteDb.mutateAsync({ databaseId: deleteId, projectId: selectedProjectId });
                    setDeleteOpen(false);
                    if (location.pathname === `/database/${deleteId}`) {
                      navigate('/');
                    }
                  } catch {
                    toast.error('Failed to delete database');
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
