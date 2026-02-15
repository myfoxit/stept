import React from 'react';
import {
  IconUserPlus,
  IconCrown,
  IconUser,
  IconEdit,
  IconEye,
} from '@tabler/icons-react';
import { useProject } from '@/providers/project-provider';
import { useProjectMembers } from '@/hooks/api/projects';
import { SiteHeader } from '@/components/site-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';

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

function MemberAvatar({ name, email }: { name?: string; email?: string }) {
  const initials = name
    ? name
        .split(' ')
        .map((w: string) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : email
      ? email[0].toUpperCase()
      : '?';

  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
      {initials}
    </div>
  );
}

export function TeamPage() {
  const navigate = useNavigate();
  const { selectedProjectId, selectedProject, userRole } = useProject();
  const { data: members, isLoading } = useProjectMembers(selectedProjectId || '');

  const canInvite = userRole === 'owner' || userRole === 'admin';

  if (!selectedProjectId) {
    return (
      <>
        <SiteHeader title="Team" />
        <div className="flex flex-1 items-center justify-center p-8">
          <p className="text-muted-foreground">Select a project to view team members.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <SiteHeader title="Team" />
      <div className="mx-auto w-full max-w-2xl p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Team</h1>
            <p className="text-sm text-muted-foreground">
              Members of {selectedProject?.name || 'this project'}
            </p>
          </div>
          {canInvite && (
            <Button
              onClick={() => navigate(`/projects/${selectedProjectId}/settings`)}
              size="sm"
            >
              <IconUserPlus className="mr-2 size-4" />
              Invite
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : !members?.length ? (
          <p className="text-muted-foreground">No members found.</p>
        ) : (
          <div className="space-y-2">
            {members.map((member: any) => {
              const RoleIcon = roleIcons[member.role] || IconUser;
              return (
                <div
                  key={member.user_id}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  <MemberAvatar
                    name={member.display_name || member.name}
                    email={member.email}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {member.display_name || member.name || 'Unknown'}
                    </p>
                    {member.email && (
                      <p className="truncate text-sm text-muted-foreground">
                        {member.email}
                      </p>
                    )}
                  </div>
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <RoleIcon className="size-3" />
                    {roleLabels[member.role] || member.role}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
