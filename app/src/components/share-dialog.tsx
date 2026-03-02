import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Copy,
  Check,
  Trash2,
  Link,
  Users,
  Loader2,
  UserPlus,
  Globe,
  Lock,
} from 'lucide-react';
import { useShare } from '@/hooks/use-share';

interface ShareDialogProps {
  resourceType: 'workflow' | 'document';
  resourceId: string;
  resourceName?: string;
  isPrivate?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}

export function ShareDialog({
  resourceType,
  resourceId,
  resourceName,
  isPrivate,
  open,
  onOpenChange,
  trigger,
}: ShareDialogProps) {
  const {
    settings,
    isLoading,
    togglePublic,
    isTogglingPublic,
    invite,
    isInviting,
    remove,
    updatePermission,
  } = useShare(resourceType, resourceId);

  const [copied, setCopied] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [permission, setPermission] = React.useState<string>('view');
  const [inviteError, setInviteError] = React.useState<string | null>(null);

  const publicUrl = settings?.share_token
    ? `${window.location.origin}/public/${resourceType === 'workflow' ? 'workflow' : 'document'}/${settings.share_token}`
    : '';

  const handleCopy = async () => {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTogglePublic = async (checked: boolean) => {
    await togglePublic(checked);
  };

  const handleInvite = async () => {
    if (!email.trim()) return;
    setInviteError(null);
    try {
      await invite({ email: email.trim(), permission });
      setEmail('');
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail || 'Failed to invite user';
      setInviteError(msg);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleInvite();
    }
  };

  // Access summary
  const summary = React.useMemo(() => {
    const parts: string[] = [];
    if (isPrivate) {
      parts.push('Only you can see this (private)');
    } else {
      parts.push('Visible to your team');
    }
    if (settings?.is_public) parts.push('Anyone with the link can view');
    if (settings?.shared_with?.length) {
      parts.push(`Shared with ${settings.shared_with.length} ${settings.shared_with.length === 1 ? 'person' : 'people'}`);
    }
    return parts.join(' · ');
  }, [settings, isPrivate]);

  const dialogContent = (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Share {resourceName ? `"${resourceName}"` : resourceType}
        </DialogTitle>
      </DialogHeader>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-6 pt-2">
          {/* Visibility status */}
          <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
            {isPrivate ? (
              <>
                <Lock className="h-4 w-4 text-amber-500" />
                <span className="text-sm">
                  <span className="font-medium">Private</span> — only you can see this
                </span>
              </>
            ) : (
              <>
                <Users className="h-4 w-4 text-blue-500" />
                <span className="text-sm">
                  <span className="font-medium">Team</span> — visible to all project members
                </span>
              </>
            )}
          </div>

          {/* Public link toggle */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {settings?.is_public ? (
                  <Globe className="h-4 w-4 text-green-600" />
                ) : (
                  <Lock className="h-4 w-4 text-muted-foreground" />
                )}
                <Label htmlFor="public-toggle" className="text-sm font-medium cursor-pointer">
                  Anyone with the link
                </Label>
              </div>
              <Switch
                id="public-toggle"
                checked={settings?.is_public ?? false}
                onCheckedChange={handleTogglePublic}
                disabled={isTogglingPublic}
              />
            </div>

            {publicUrl && (
              <div className={`flex gap-2 transition-opacity ${!settings?.is_public ? 'opacity-40' : ''}`}>
                <Input
                  value={publicUrl}
                  readOnly
                  className="flex-1 text-xs font-mono bg-muted/50"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  className="shrink-0"
                  disabled={!settings?.is_public}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t" />

          {/* Invite people */}
          <div className="space-y-3">
            <Label className="text-sm font-medium flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Add people
            </Label>
            <div className="flex gap-2">
              <Input
                placeholder="Email address"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setInviteError(null);
                }}
                onKeyDown={handleKeyDown}
                className="flex-1"
              />
              <Select value={permission} onValueChange={setPermission}>
                <SelectTrigger className="w-[110px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="view">Can view</SelectItem>
                  <SelectItem value="edit">Can edit</SelectItem>
                </SelectContent>
              </Select>
              <Button
                onClick={handleInvite}
                disabled={!email.trim() || isInviting}
                size="sm"
              >
                {isInviting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Add'
                )}
              </Button>
            </div>
            {inviteError && (
              <p className="text-xs text-destructive">{inviteError}</p>
            )}
          </div>

          {/* Shared users list */}
          {settings?.shared_with && settings.shared_with.length > 0 && (
            <div className="space-y-2">
              {settings.shared_with.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                      {(user.user_name || user.email)[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {user.user_name || user.email}
                      </p>
                      {user.user_name && (
                        <p className="text-xs text-muted-foreground truncate">
                          {user.email}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Select
                      value={user.permission}
                      onValueChange={(val) =>
                        updatePermission({ shareId: user.id, permission: val })
                      }
                    >
                      <SelectTrigger className="h-7 w-[90px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="view">Can view</SelectItem>
                        <SelectItem value="edit">Can edit</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => remove(user.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Access summary */}
          <div className="rounded-md bg-muted/50 px-3 py-2">
            <p className="text-xs text-muted-foreground">{summary}</p>
          </div>
        </div>
      )}
    </DialogContent>
  );

  if (trigger) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        {dialogContent}
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {dialogContent}
    </Dialog>
  );
}
