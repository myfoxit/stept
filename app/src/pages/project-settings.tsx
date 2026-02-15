import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  IconArrowLeft,
  IconCopy,
  IconUserPlus,
  IconTrash,
  IconCrown,
  IconUser,
  IconEdit,
  IconEye,
  IconCheck,
  IconBrain,
  IconPlugConnected,
  IconShieldLock,
  IconSparkles,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
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
import { toast } from 'sonner';
import { useProject } from '@/providers/project-provider';
import { apiClient } from '@/lib/apiClient';
import { useMe } from '@/hooks/api/auth';
import { useProjectMembers, useRemoveProjectMember, useUpdateMemberRole } from '@/hooks/api/projects';
import { SiteHeader } from '@/components/site-header';
import { fetchChatConfig, fetchChatModels, type ChatConfig, type ChatModel } from '@/api/chat';
import { LlmSetupWizard, LlmStatusBadge } from '@/components/Settings/LlmSetupWizard';
import { AiUsageCard } from '@/components/Settings/AiUsageCard';
import { ProviderLogin } from '@/components/Settings/ProviderLogin';
import { GitSyncCard } from '@/components/Settings/GitSyncCard';
import { McpSettingsCard } from '@/components/Settings/McpSettingsCard';

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

  const { selectedProject } = useProject();
  const { data: currentUser } = useMe();
  const { data: members, isLoading } = useProjectMembers(projectId || '');
  const removeMember = useRemoveProjectMember();
  const updateRole = useUpdateMemberRole();
  
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('viewer');
  const [linkCopied, setLinkCopied] = useState(false);

  // ── AI / LLM Settings ──────────────────────────────────────────────────────
  const [aiConfig, setAiConfig] = useState<ChatConfig | null>(null);
  const [aiModels, setAiModels] = useState<ChatModel[]>([]);
  const [aiTesting, setAiTesting] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  const refreshAiConfig = () => {
    fetchChatConfig().then(setAiConfig).catch(() => {});
    fetchChatModels().then(setAiModels).catch(() => {});
  };

  useEffect(() => {
    refreshAiConfig();
  }, []);

  const testAiConnection = async () => {
    setAiTesting(true);
    try {
      const models = await fetchChatModels();
      if (models.length > 0) {
        toast.success('Connection successful', {
          description: `Found ${models.length} model(s). Provider: ${aiConfig?.provider || 'unknown'}`,
        });
        setAiModels(models);
      } else {
        toast.warning('Connected but no models found');
      }
    } catch {
      toast.error('Connection failed', { description: 'Check your provider settings and API key.' });
    } finally {
      setAiTesting(false);
    }
  };
  
  // Check if current user is owner or admin
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
    toast.success('Link copied!', {
      description: 'The invite link has been copied to your clipboard.',
    });
    setTimeout(() => setLinkCopied(false), 2000);
  };
  
  const handleRemoveMember = async (userId: string) => {
    if (!projectId) return;
    
    try {
      await removeMember.mutateAsync({ projectId, userId });
      toast.success('Member removed', {
        description: 'The member has been removed from the project.',
      });
    } catch (error) {
      toast.error('Failed to remove member');
    }
  };
  
  const handleRoleChange = async (userId: string, newRole: string) => {
    if (!projectId) return;
    
    try {
      await updateRole.mutateAsync({ projectId, userId, role: newRole });
      toast.success('Role updated', {
        description: 'The member\'s role has been updated.',
      });
    } catch (error) {
      toast.error('Failed to update role');
    }
  };
  
  return (
    <>
      <SiteHeader name="Project Settings">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(-1)}
        >
          <IconArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </SiteHeader>
      
      <div className="container mx-auto p-6 max-w-4xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold">{selectedProject?.name || 'Project Settings'}</h1>
          <p className="text-muted-foreground">
            Manage your project members and settings
          </p>
        </div>
        
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
                            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                              <IconUser className="h-4 w-4" />
                            </div>
                            <span>{member.user_id}</span>
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
        
        {/* AI / LLM Settings Card */}
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IconBrain className="h-5 w-5" />
                <CardTitle>AI / LLM Settings</CardTitle>
              </div>
              <LlmStatusBadge config={aiConfig} />
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Current config summary */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Provider</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium capitalize">
                    {aiConfig?.provider || 'Not configured'}
                  </span>
                  {aiConfig?.configured && (
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Model</Label>
                <span className="text-sm font-medium">
                  {aiConfig?.model || '—'}
                </span>
              </div>
            </div>

            {/* Status indicators */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 text-sm">
                <IconPlugConnected className="h-4 w-4" />
                <span>Status:</span>
                {aiConfig?.configured ? (
                  <span className="text-green-500 font-medium">Connected</span>
                ) : (
                  <span className="text-muted-foreground">Not configured</span>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <IconShieldLock className="h-4 w-4" />
                <span>DataVeil:</span>
                {aiConfig?.dataveil_enabled ? (
                  <span className="text-green-500 font-medium">Active</span>
                ) : (
                  <span className="text-muted-foreground">Disabled</span>
                )}
              </div>
            </div>

            {/* Available models */}
            {aiModels.length > 0 && (
              <div className="space-y-2">
                <Label>Available Models</Label>
                <div className="flex flex-wrap gap-2">
                  {aiModels.map((m) => (
                    <span
                      key={m.id}
                      className="rounded-md border border-border bg-muted px-2 py-1 text-xs"
                    >
                      {m.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Provider Login (OAuth / Device Flow) */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Quick Login</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Login with your existing provider account — no API key needed.
              </p>
              <ProviderLogin onStatusChange={refreshAiConfig} />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <Button
                onClick={() => setWizardOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                <IconSparkles className="mr-2 h-4 w-4" />
                {aiConfig?.configured ? 'Reconfigure AI' : 'Setup AI Provider'}
              </Button>
              <Button
                variant="outline"
                onClick={testAiConnection}
                disabled={aiTesting}
              >
                {aiTesting ? 'Testing…' : 'Test Connection'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <LlmSetupWizard
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          onConfigSaved={refreshAiConfig}
        />

        {aiConfig?.configured && <AiUsageCard />}

        {/* Git Sync — only for admin/owner */}
        {canManageMembers && projectId && <GitSyncCard projectId={projectId} />}

        {/* MCP API Keys — only for admin/owner */}
        {canManageMembers && projectId && <McpSettingsCard projectId={projectId} />}
        
        {/* Invite Dialog */}
        <Dialog open={inviteDialogOpen} onOpenChange={(open) => {
          setInviteDialogOpen(open);
          if (!open) { setInviteLink(''); setInviteEmail(''); setLinkCopied(false); }
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Invite Member</DialogTitle>
              <DialogDescription>
                Enter the email address of the person you want to invite. Only this email will be able to join.
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
                    <Input
                      id="link"
                      value={inviteLink}
                      readOnly
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={copyInviteLink}
                    >
                      {linkCopied ? (
                        <IconCheck className="h-4 w-4" />
                      ) : (
                        <IconCopy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This link will allow users to join your project with the selected role.
                  </p>
                </div>
              )}
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setInviteDialogOpen(false);
                setInviteLink('');
              }}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
