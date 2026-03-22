import React from 'react';
import { useParams } from 'react-router-dom';
import { useMe } from '@/hooks/api/auth';
import { useProjectMembers } from '@/hooks/api/projects';
import { GitSyncCard } from '@/components/Settings/GitSyncCard';
import { McpSettingsCard } from '@/components/Settings/McpSettingsCard';
import { ReindexCard } from '@/components/Settings/ReindexCard';
import { SettingsLayout } from '@/components/settings-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function IntegrationCard({ 
  title, description, icon, status, children, comingSoon 
}: { 
  title: string; description: string; icon: string; status?: 'connected' | 'disconnected'; children?: React.ReactNode; comingSoon?: boolean;
}) {
  return (
    <Card className={comingSoon ? 'opacity-60' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{icon}</span>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {title}
                {comingSoon && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Coming soon</Badge>}
                {status === 'connected' && <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-green-600">Connected</Badge>}
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">{description}</CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      {children && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  );
}

export function IntegrationsSettingsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: currentUser } = useMe();
  const { data: members } = useProjectMembers(projectId || '');

  const currentUserMember = members?.find(m => m.user_id === currentUser?.id);
  const canManage = currentUserMember?.role === 'owner' || currentUserMember?.role === 'admin';

  return (
    <SettingsLayout 
      title="Integrations" 
      description="Connect stept with your team's tools to surface knowledge where the work happens."
    >
      <div className="space-y-6">
        {/* Surfacing integrations */}
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Knowledge Surfacing</h3>
          <div className="space-y-4">
            <IntegrationCard
              icon="💬"
              title="Slack"
              description="Surface relevant workflows when team members ask questions in Slack. @mention the bot to search."
              comingSoon={false}
            >
              {canManage && projectId && (
                <p className="text-sm text-muted-foreground">
                  Configure your Slack bot token and signing secret to enable the integration.
                  <br />
                  <a href="https://api.slack.com/apps" target="_blank" rel="noopener" className="text-primary hover:underline">Create a Slack App →</a>
                </p>
              )}
            </IntegrationCard>

            <IntegrationCard
              icon="👥"
              title="Microsoft Teams"
              description="Surface relevant workflows in Teams channels. @mention the bot to search your knowledge base."
              comingSoon={false}
            >
              {canManage && projectId && (
                <p className="text-sm text-muted-foreground">
                  Configure an incoming webhook or Bot Framework app to connect.
                  <br />
                  <a href="https://dev.teams.microsoft.com/" target="_blank" rel="noopener" className="text-primary hover:underline">Teams Developer Portal →</a>
                </p>
              )}
            </IntegrationCard>

            {canManage && projectId && <McpSettingsCard projectId={projectId} />}
          </div>
        </div>

        {/* Developer integrations */}
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Developer & Sync</h3>
          <div className="space-y-4">
            {canManage && projectId && <GitSyncCard projectId={projectId} />}
            {projectId && <ReindexCard projectId={projectId} />}
          </div>
        </div>

        {!canManage && (
          <p className="text-sm text-muted-foreground">
            You need admin or owner permissions to manage integrations.
          </p>
        )}
      </div>
    </SettingsLayout>
  );
}
