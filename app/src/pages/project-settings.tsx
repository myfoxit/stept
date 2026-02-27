import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  IconCopy,
  IconUserPlus,
  IconTrash,
  IconCrown,
  IconUser,
  IconEdit,
  IconEye,
  IconCheck,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useProject } from '@/providers/project-provider';
import { apiClient } from '@/lib/apiClient';
import { useMe } from '@/hooks/api/auth';
import { useProjectMembers, useRemoveProjectMember, useUpdateMemberRole } from '@/hooks/api/projects';
import { SettingsLayout } from '@/components/settings-layout';

const roleIcons: Record<string, typeof IconCrown> = {
  owner: IconCrown,
  admin: IconUser,
  editor: IconEdit,
  viewer: IconEye,
};

const roleLabels: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
};

export function ProjectSettingsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { selectedProject, deleteProject } = useProject();
  const { data: currentUser } = useMe();
  const { data: members, isLoading } = useProjectMembers(projectId || '');
  const removeMember = useRemoveProjectMember();
  const updateRole = useUpdateMemberRole();
  
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('viewer');
  const [linkCopied, setLinkCopied] = useState(false);

  const currentUserMember = members?.find(m => m.user_id === currentUser?.id);
  const canManageMembers = currentUserMember?.role === 'owner' || currentUserMember?.role === 'admin';
  
  const generateInviteLink = async () => {
    if (!inviteEmail.trim()) {
      toast.error('Please enter an email address');
      return;
    }
    try {
      const response = await apiClient.post(`/projects/${projectId}/invite`, {
        email: inviteEmail.trim(),
        role: inviteRole
      });
      const baseUrl = window.location.origin;
      const link = `${baseUrl}/join-project?token=${response.data.token}`;
      setInviteLink(link);
    } catch (error) {
      toast.error('Failed to generate invite link');
    }
  };
  
  const copyInviteLink = async () => {
    await navigator.clipboard.writeText(inviteLink);
    setLinkCopied(true);
    toast.success('Link copied!');
    setTimeout(() => setLinkCopied(false), 2000);
  };
  
  const handleRemoveMember = async (userId: string) => {
    if (!projectId) return;
    try {
      await removeMember.mutateAsync({ projectId, userId });
      toast.success('Member removed');
    } catch (error) {
      toast.error('Failed to remove member');
    }
  };
  
  const handleRoleChange = async (userId: string, newRole: string) => {
    if (!projectId) return;
    try {
      await updateRole.mutateAsync({ projectId, userId, role: newRole });
      toast.success('Role updated');
    } catch (error) {
      toast.error('Failed to update role');
    }
  };
  
  return (
    <SettingsLayout
      title={selectedProject?.name || 'Project Settings'}
      description="Manage your project members and settings"
    >
      {/* Members Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Project Members</CardTitle>
          {canManageMembers && (
            <Button onClick={() => setInviteDialogOpen(true)}>
              <IconUserPlus className="mr-2 h-4 w-4" />
              Invite Members
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center py-4 text-muted-foreground">Loading members...</p>
          ) : members && members.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  {canManageMembers && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => {
                  const RoleIcon = roleIcons[member.role] || IconUser;
                  const isCurrentUser = member.user_id === currentUser?.id;
                  const isOwner = member.role === 'owner';
                  
                  return (
                    <TableRow key={member.user_id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                            {(member.display_name || member.email || '?')[0].toUpperCase()}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-medium">{member.display_name || member.email || member.user_id}</span>
                            {member.email && member.display_name && (
                              <span className="text-xs text-muted-foreground">{member.email}</span>
                            )}
                          </div>
                          {isCurrentUser && (
                            <span className="text-xs text-muted-foreground">(You)</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <RoleIcon className="h-4 w-4" />
                          {canManageMembers && !isOwner ? (
                            <Select
                              value={member.role}
                              onValueChange={(value) => handleRoleChange(member.user_id, value)}
                              disabled={isCurrentUser}
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="editor">Editor</SelectItem>
                                <SelectItem value="viewer">Viewer</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span>{roleLabels[member.role]}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {new Date(member.joined_at).toLocaleDateString()}
                      </TableCell>
                      {canManageMembers && (
                        <TableCell>
                          {!isOwner && !isCurrentUser && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveMember(member.user_id)}
                            >
                              <IconTrash className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center py-4 text-muted-foreground">
              No members yet. Invite someone to collaborate!
            </p>
          )}
        </CardContent>
      </Card>
      
      {/* Danger Zone */}
      {currentUserMember?.role === 'owner' && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="font-medium">Delete this project</p>
              <p className="text-sm text-muted-foreground">
                Once deleted, the project and all its data will be permanently removed.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <IconTrash className="mr-2 h-4 w-4" />
                  Delete Project
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the project "{selectedProject?.name}" and all of its data. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={async () => {
                      if (!projectId) return;
                      try {
                        await deleteProject(projectId);
                        toast.success('Project deleted');
                        navigate('/');
                      } catch (error) {
                        toast.error('Failed to delete project');
                      }
                    }}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      )}

      {/* Invite Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={(open) => {
        setInviteDialogOpen(open);
        if (!open) { setInviteLink(''); setInviteEmail(''); setLinkCopied(false); }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite Member</DialogTitle>
            <DialogDescription>
              Enter the email address of the person you want to invite.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                disabled={!!inviteLink}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole} disabled={!!inviteLink}>
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {!inviteLink ? (
              <Button onClick={generateInviteLink} className="w-full">
                Generate Invite Link
              </Button>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="link">Invite Link</Label>
                <div className="flex items-center space-x-2">
                  <Input id="link" value={inviteLink} readOnly className="flex-1" />
                  <Button type="button" size="sm" onClick={copyInviteLink}>
                    {linkCopied ? <IconCheck className="h-4 w-4" /> : <IconCopy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { setInviteDialogOpen(false); setInviteLink(''); }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsLayout>
  );
}
