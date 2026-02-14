// ────────────────────────────────────────────
// File: src/hooks/use-share.ts
// ────────────────────────────────────────────
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getShareSettings,
  togglePublicLink,
  inviteUser,
  removeInvite,
  updateInvitePermission,
  type ShareSettings,
} from '@/api/sharing';

const shareKeys = {
  settings: (type: string, id: string) => ['share', type, id] as const,
};

export function useShare(resourceType: 'workflow' | 'document', resourceId: string) {
  const qc = useQueryClient();
  const queryKey = shareKeys.settings(resourceType, resourceId);

  const settingsQuery = useQuery<ShareSettings>({
    queryKey,
    queryFn: () => getShareSettings(resourceType, resourceId),
    enabled: !!resourceId,
  });

  const togglePublicMutation = useMutation({
    mutationFn: (enable: boolean) => togglePublicLink(resourceType, resourceId, enable),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
    },
  });

  const inviteMutation = useMutation({
    mutationFn: ({ email, permission }: { email: string; permission: string }) =>
      inviteUser(resourceType, resourceId, email, permission),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (shareId: string) => removeInvite(resourceType, resourceId, shareId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
    },
  });

  const updatePermissionMutation = useMutation({
    mutationFn: ({ shareId, permission }: { shareId: string; permission: string }) =>
      updateInvitePermission(resourceType, resourceId, shareId, permission),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
    },
  });

  return {
    settings: settingsQuery.data,
    isLoading: settingsQuery.isLoading,
    togglePublic: togglePublicMutation.mutateAsync,
    isTogglingPublic: togglePublicMutation.isPending,
    invite: inviteMutation.mutateAsync,
    isInviting: inviteMutation.isPending,
    remove: removeMutation.mutateAsync,
    updatePermission: updatePermissionMutation.mutateAsync,
  };
}
