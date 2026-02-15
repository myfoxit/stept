'use client';

import * as React from 'react';
import {
  IconHelp,
  IconPlus,
  IconSettings,
  IconTableFilled,
  IconUsers,
  IconChevronDown,
  IconCheck,
  IconPencil,
  IconTrash,
  IconDotsVertical,
  IconShare,
  IconLink,
} from '@tabler/icons-react';

import { NavMain } from '@/components/nav-main';
import { NavSecondary } from '@/components/nav-secondary';
import { NavUser } from '@/components/nav-user';
import { NavPages } from '@/components/nav-pages';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

import { useProject } from '@/providers/project-provider';
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
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Link, useNavigate } from 'react-router-dom';
import { useUpdateProject } from '@/hooks/api/projects';
import { toast } from 'sonner';

const data = {
  user: {
    name: 'Alexander Höhne',
    email: 'hello@ondoki.com',
    avatar: '/profile.png',
  },
  navMain: [
    {
      title: 'Shared with me',
      url: '/shared',
      icon: IconShare,
    },
    {
      title: 'Context Links',
      url: '/context-links',
      icon: IconLink,
    },
    {
      title: 'Team',
      url: '/team',
      icon: IconUsers,
    },
  ],
  navSecondary: [
    {
      title: 'Settings',
      url: 'settings',
      icon: IconSettings,
    },
    {
      title: 'Get Help',
      url: 'https://docs.ondoki.com',
      icon: IconHelp,
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const navigate = useNavigate();
  const {
    selectedProjectId,
    selectedProject,
    setSelectedProjectId,
    projects,
    createProject,
    isLoading: projectsLoading,
    deleteProject,
    userRole,
  } = useProject();
  const updateProjectMutation = useUpdateProject();

  const [newProjectDialogOpen, setNewProjectDialogOpen] = React.useState(false);
  const [newProjectName, setNewProjectName] = React.useState('');
  const [renameDialogOpen, setRenameDialogOpen] = React.useState(false);
  const [renameProjectId, setRenameProjectId] = React.useState<string | null>(
    null
  );
  const [renameProjectName, setRenameProjectName] = React.useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [deleteProjectId, setDeleteProjectId] = React.useState<string | null>(
    null
  );

  function openRename(p: { id: string; name: string }) {
    setRenameProjectId(p.id);
    setRenameProjectName(p.name);
    setRenameDialogOpen(true);
  }
  function openDelete(p: { id: string }) {
    setDeleteProjectId(p.id);
    setDeleteConfirmOpen(true);
  }

  // Helper to check permissions
  const canEditProject = userRole === 'owner' || userRole === 'admin';
  const canDeleteProject = userRole === 'owner';

  return (
    <Sidebar
      collapsible="offcanvas"
      data-testid="sidebar"
      {...props}
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <Link to="#">
                <IconTableFilled className="!size-5" />
                <span className="text-base font-semibold">Ondoki</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <div className="px-1.5 py-1">
              {/* If projects are loading */}
              {projectsLoading && !projects.length && (
                <Button
                  variant="outline"
                  disabled
                  className="h-8 w-full animate-pulse justify-center"
                >
                  Loading…
                </Button>
              )}

              {/* No projects yet */}
              {!projectsLoading && projects.length === 0 && (
                <Button
                  className="h-8 w-full justify-center"
                  onClick={() => setNewProjectDialogOpen(true)}
                  data-testid="create-first-project-btn"
                >
                  <IconPlus className="mr-2 size-4" />
                  Create Project
                </Button>
              )}

              {/* Projects exist */}
              {projects.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="default"
                      className="h-8 w-full justify-between px-2 font-medium"
                      data-testid="project-selector-trigger"
                    >
                      <span className="truncate">
                        {selectedProject?.name || 'Select Project'}
                      </span>
                      <IconChevronDown className="size-4 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="w-64"
                    sideOffset={4}
                    data-testid="project-selector-dropdown"
                  >
                    <DropdownMenuLabel className="text-xs uppercase tracking-wide">
                      Projects
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {projects.map((p) => (
                      <DropdownMenuItem
                        key={p.id}
                        onClick={() => setSelectedProjectId(p.id)}
                        className="group relative flex w-full items-center gap-2 pr-2"
                        data-testid={`project-item-${p.id}`}
                      >
                        <span className="truncate pr-12">{p.name}</span>
                        {p.created_by_name && (
                          <span className="text-xs text-muted-foreground ml-1 truncate">
                            by {p.created_by_name}
                          </span>
                        )}
                        {p.id === selectedProjectId && (
                          <IconCheck className="size-4 shrink-0 text-muted-foreground" />
                        )}
                        {/* Only show actions menu if user has permissions */}
                        {p.id === selectedProjectId && canEditProject && (
                          <div className="pointer-events-none absolute inset-y-0 right-1 flex items-center">
                            <div className="pointer-events-auto opacity-0 transition-opacity group-hover:opacity-100">
                              <DropdownMenu
                                onOpenChange={() => {}}
                              >
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="size-6"
                                    onClick={(e) => e.stopPropagation()}
                                    data-testid={`project-actions-${p.id}`}
                                  >
                                    <IconDotsVertical className="size-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  align="end"
                                  sideOffset={4}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate(`/projects/${p.id}/settings`);
                                    }}
                                    className="flex items-center gap-2"
                                    data-testid={`settings-project-${p.id}`}
                                  >
                                    <IconSettings className="size-4" />
                                    Settings
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openRename(p);
                                    }}
                                    className="flex items-center gap-2"
                                    data-testid={`rename-project-${p.id}`}
                                  >
                                    <IconPencil className="size-4" />
                                    Rename
                                  </DropdownMenuItem>
                                  {canDeleteProject && (
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openDelete(p);
                                      }}
                                      className="flex items-center gap-2 text-destructive focus:text-destructive"
                                      data-testid={`delete-project-${p.id}`}
                                    >
                                      <IconTrash className="size-4" />
                                      Delete
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        )}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setNewProjectDialogOpen(true)}
                      className="text-primary focus:text-primary"
                      data-testid="new-project-dropdown-btn"
                    >
                      <IconPlus className="mr-2 size-4" />
                      New Project
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavPages userRole={userRole} />

        {/* New Project Dialog */}
        <Dialog
          open={newProjectDialogOpen}
          onOpenChange={setNewProjectDialogOpen}
        >
          <DialogContent data-testid="new-project-dialog">
            <DialogHeader>
              <DialogTitle>Create Project</DialogTitle>
              <DialogDescription>
                Add a new project to organize your documents.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="newProjectName">Project Name</Label>
                <Input
                  id="newProjectName"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="My Project"
                  data-testid="new-project-name-input"
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" data-testid="new-project-cancel-btn">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                onClick={async () => {
                  try {
                    const p = await createProject(newProjectName.trim());
                    setNewProjectName('');
                    setNewProjectDialogOpen(false);
                    setSelectedProjectId(p.id);
                  } catch (err: any) {
                    const detail = err?.response?.data?.detail || err?.message || '';
                    if (err?.response?.status === 409 || detail.includes('already have a project')) {
                      toast.error('Duplicate project name', {
                        description: 'You already have a project with this name. Please choose a different name.',
                      });
                    } else {
                      toast.error('Failed to create project', { description: detail });
                    }
                  }
                }}
                disabled={!newProjectName.trim()}
                data-testid="new-project-create-btn"
              >
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rename Project Dialog */}
        <Dialog
          open={renameDialogOpen}
          onOpenChange={(o) => {
            setRenameDialogOpen(o);
            if (!o) {
              setRenameProjectId(null);
              setRenameProjectName('');
            }
          }}
        >
          <DialogContent data-testid="rename-project-dialog">
            <DialogHeader>
              <DialogTitle>Rename Project</DialogTitle>
              <DialogDescription>Update the project name.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="renameProjectName">Project Name</Label>
                <Input
                  id="renameProjectName"
                  value={renameProjectName}
                  onChange={(e) => setRenameProjectName(e.target.value)}
                  placeholder="Project name"
                  data-testid="rename-project-input"
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button
                  variant="outline"
                  data-testid="rename-project-cancel-btn"
                >
                  Cancel
                </Button>
              </DialogClose>
              <Button
                disabled={
                  updateProjectMutation.isPending ||
                  !renameProjectName.trim() ||
                  !renameProjectId ||
                  renameProjectName.trim() ===
                    projects.find((p) => p.id === renameProjectId)?.name
                }
                onClick={async () => {
                  if (!renameProjectId) return;
                  updateProjectMutation.mutate(
                    {
                      projectId: renameProjectId,
                      name: renameProjectName.trim(),
                    },
                    {
                      onSuccess: () => {
                        setRenameDialogOpen(false);
                        setRenameProjectId(null);
                        setRenameProjectName('');
                      },
                    }
                  );
                }}
                data-testid="rename-project-save-btn"
              >
                {updateProjectMutation.isPending ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Project Confirm */}
        <Dialog
          open={deleteConfirmOpen}
          onOpenChange={(o) => {
            setDeleteConfirmOpen(o);
            if (!o) setDeleteProjectId(null);
          }}
        >
          <DialogContent data-testid="delete-project-dialog">
            <DialogHeader>
              <DialogTitle>Delete Project</DialogTitle>
              <DialogDescription>
                This will permanently remove the project and its data. This
                action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button
                  variant="outline"
                  data-testid="delete-project-cancel-btn"
                >
                  Cancel
                </Button>
              </DialogClose>
              <Button
                variant="destructive"
                disabled={!deleteProjectId}
                onClick={async () => {
                  if (deleteProjectId) {
                    const removedActive = deleteProjectId === selectedProjectId;
                    await deleteProject?.(deleteProjectId);
                    if (removedActive) {
                      const remaining = projects.filter(
                        (p) => p.id !== deleteProjectId
                      );
                      setSelectedProjectId(remaining[0]?.id || null);
                    }
                  }
                  setDeleteConfirmOpen(false);
                  setDeleteProjectId(null);
                }}
                data-testid="delete-project-confirm-btn"
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <NavSecondary items={data.navSecondary} projectId={selectedProjectId} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  );
}
