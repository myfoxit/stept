// ────────────────────────────────────────────
// File: src/api/sharing.ts
// ────────────────────────────────────────────
import { apiClient } from '@/lib/apiClient';

export interface SharedUser {
  id: string;
  email: string;
  permission: 'view' | 'edit';
  user_name: string | null;
}

export interface ShareSettings {
  is_public: boolean;
  share_token: string | null;
  public_url: string | null;
  shared_with: SharedUser[];
}

function getBasePath(resourceType: 'workflow' | 'document', resourceId: string): string {
  if (resourceType === 'workflow') {
    return `/process-recording/workflow/${resourceId}/share`;
  }
  return `/documents/${resourceId}/share`;
}

/** Get current share settings for a resource */
export async function getShareSettings(
  resourceType: 'workflow' | 'document',
  resourceId: string,
): Promise<ShareSettings> {
  const { data } = await apiClient.get(getBasePath(resourceType, resourceId));
  return data;
}

/** Enable or disable the public link */
export async function togglePublicLink(
  resourceType: 'workflow' | 'document',
  resourceId: string,
  enable: boolean,
): Promise<ShareSettings> {
  const base = getBasePath(resourceType, resourceId);
  if (enable) {
    const { data } = await apiClient.post(`${base}/public`);
    return data;
  } else {
    const { data } = await apiClient.delete(`${base}/public`);
    return data;
  }
}

/** Invite a user by email */
export async function inviteUser(
  resourceType: 'workflow' | 'document',
  resourceId: string,
  email: string,
  permission: string,
): Promise<SharedUser> {
  const base = getBasePath(resourceType, resourceId);
  const { data } = await apiClient.post(`${base}/invite`, { email, permission });
  return data;
}

/** Remove a user's access */
export async function removeInvite(
  resourceType: 'workflow' | 'document',
  resourceId: string,
  shareId: string,
): Promise<void> {
  const base = getBasePath(resourceType, resourceId);
  await apiClient.delete(`${base}/invite/${shareId}`);
}

/** Update a user's permission */
export async function updateInvitePermission(
  resourceType: 'workflow' | 'document',
  resourceId: string,
  shareId: string,
  permission: string,
): Promise<void> {
  const base = getBasePath(resourceType, resourceId);
  await apiClient.patch(`${base}/invite/${shareId}`, { permission });
}

// ── "Shared with me" ──

export interface SharedResource {
  id: string;
  name: string;
  created_at: string | null;
  updated_at: string | null;
  total_steps?: number;
}

export interface SharedWithMeItem {
  id: string;
  resource_type: 'document' | 'workflow';
  resource_id: string;
  permission: 'view' | 'edit';
  shared_by_name: string;
  shared_at: string | null;
  resource: SharedResource;
}

export interface SharedWithMeResponse {
  items: SharedWithMeItem[];
}

/** Get all resources shared with the current user */
export async function getSharedWithMe(): Promise<SharedWithMeResponse> {
  const { data } = await apiClient.get('/shared-with-me');
  return data;
}
