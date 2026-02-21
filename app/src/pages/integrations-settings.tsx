import React from 'react';
import { useParams } from 'react-router-dom';
import { useProject } from '@/providers/project-provider';
import { useMe } from '@/hooks/api/auth';
import { useProjectMembers } from '@/hooks/api/projects';
import { GitSyncCard } from '@/components/Settings/GitSyncCard';
import { McpSettingsCard } from '@/components/Settings/McpSettingsCard';
import { ReindexCard } from '@/components/Settings/ReindexCard';
import { SettingsLayout } from '@/components/settings-layout';

export function IntegrationsSettingsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: currentUser } = useMe();
  const { data: members } = useProjectMembers(projectId || '');

  const currentUserMember = members?.find(m => m.user_id === currentUser?.id);
  const canManage = currentUserMember?.role === 'owner' || currentUserMember?.role === 'admin';

  return (
    <SettingsLayout title="Integrations" description="Git sync, MCP API keys, and knowledge base indexing.">
      <div className="space-y-6">
        {canManage && projectId && <GitSyncCard projectId={projectId} />}
        {canManage && projectId && <McpSettingsCard projectId={projectId} />}
        {projectId && <ReindexCard projectId={projectId} />}

        {!canManage && (
          <p className="text-sm text-muted-foreground">
            You need admin or owner permissions to manage integrations.
          </p>
        )}
      </div>
    </SettingsLayout>
  );
}
