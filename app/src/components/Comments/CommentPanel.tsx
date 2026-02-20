import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  IconCheck,
  IconTrash,
  IconPencil,
  IconCornerDownRight,
  IconX,
  IconSend,
} from '@tabler/icons-react';
import {
  listComments,
  createComment,
  updateComment,
  deleteComment,
  toggleResolveComment,
  type Comment,
} from '@/api/comments';

// ── Helpers ─────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

const AVATAR_COLORS = [
  'bg-primary',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-violet-500',
  'bg-teal-500',
  'bg-pink-500',
];

function avatarColor(userId: string): string {
  let hash = 0;
  for (const ch of userId) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ── Props ───────────────────────────────────────────────────────────

interface CommentPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  resourceType: 'document' | 'workflow';
  resourceId: string;
  currentUserId: string;
  onCountChange?: (count: number) => void;
}

// ── Component ───────────────────────────────────────────────────────

export function CommentPanel({
  open,
  onOpenChange,
  projectId,
  resourceType,
  resourceId,
  currentUserId,
  onCountChange,
}: CommentPanelProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newContent, setNewContent] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchComments = useCallback(async () => {
    if (!projectId || !resourceId) return;
    try {
      const data = await listComments(projectId, resourceType, resourceId);
      setComments(data);
      onCountChange?.(data.length);
    } catch {
      // ignore
    }
  }, [projectId, resourceType, resourceId, onCountChange]);

  useEffect(() => {
    if (open) fetchComments();
  }, [open, fetchComments]);

  // Also fetch on mount to get count
  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const topLevel = useMemo(
    () => comments.filter((c) => !c.parent_id),
    [comments],
  );

  const repliesMap = useMemo(() => {
    const map: Record<string, Comment[]> = {};
    for (const c of comments) {
      if (c.parent_id) {
        (map[c.parent_id] ??= []).push(c);
      }
    }
    return map;
  }, [comments]);

  const handleSubmit = async () => {
    if (!newContent.trim()) return;
    setLoading(true);
    try {
      await createComment(projectId, {
        resource_type: resourceType,
        resource_id: resourceId,
        content: newContent.trim(),
      });
      setNewContent('');
      await fetchComments();
    } finally {
      setLoading(false);
    }
  };

  const handleReply = async (parentId: string) => {
    if (!replyContent.trim()) return;
    setLoading(true);
    try {
      await createComment(projectId, {
        resource_type: resourceType,
        resource_id: resourceId,
        content: replyContent.trim(),
        parent_id: parentId,
      });
      setReplyTo(null);
      setReplyContent('');
      await fetchComments();
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async (id: string) => {
    if (!editContent.trim()) return;
    setLoading(true);
    try {
      await updateComment(id, editContent.trim());
      setEditingId(null);
      setEditContent('');
      await fetchComments();
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this comment?')) return;
    await deleteComment(id);
    await fetchComments();
  };

  const handleResolve = async (id: string) => {
    await toggleResolveComment(id);
    await fetchComments();
  };

  const renderComment = (comment: Comment, isReply = false) => {
    const isOwn = comment.user_id === currentUserId;
    const isEditing = editingId === comment.id;
    const replies = repliesMap[comment.id] ?? [];
    const dimmed = comment.resolved && !isReply;

    return (
      <div
        key={comment.id}
        className={`${isReply ? 'ml-8 border-l-2 border-slate-200 pl-3' : ''} ${dimmed ? 'opacity-50' : ''}`}
      >
        <div className="group flex items-start gap-2 py-2">
          {/* Avatar */}
          <div
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ${avatarColor(comment.user_id)}`}
          >
            {initials(comment.user_display_name)}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium text-slate-800">
                {comment.user_display_name}
              </span>
              <span className="text-slate-400">{relativeTime(comment.created_at)}</span>
            </div>

            {isEditing ? (
              <div className="mt-1 space-y-1">
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={2}
                  className="text-sm"
                  autoFocus
                />
                <div className="flex gap-1">
                  <Button size="sm" variant="default" onClick={() => handleEdit(comment.id)} disabled={loading}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                    <IconX className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">
                {comment.content}
              </p>
            )}

            {/* Actions */}
            {!isEditing && (
              <div className="mt-1 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                {!isReply && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-xs"
                    onClick={() => {
                      setReplyTo(replyTo === comment.id ? null : comment.id);
                      setReplyContent('');
                    }}
                  >
                    <IconCornerDownRight className="mr-0.5 h-3 w-3" />
                    Reply
                  </Button>
                )}
                {!isReply && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-xs"
                    onClick={() => handleResolve(comment.id)}
                  >
                    <IconCheck className="mr-0.5 h-3 w-3" />
                    {comment.resolved ? 'Unresolve' : 'Resolve'}
                  </Button>
                )}
                {isOwn && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-xs"
                    onClick={() => {
                      setEditingId(comment.id);
                      setEditContent(comment.content);
                    }}
                  >
                    <IconPencil className="h-3 w-3" />
                  </Button>
                )}
                {isOwn && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-xs text-red-500 hover:text-red-600"
                    onClick={() => handleDelete(comment.id)}
                  >
                    <IconTrash className="h-3 w-3" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Replies */}
        {replies.map((r) => renderComment(r, true))}

        {/* Reply input */}
        {replyTo === comment.id && (
          <div className="ml-8 mt-1 flex gap-2 border-l-2 border-slate-200 pl-3 pb-2">
            <Textarea
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder="Write a reply…"
              rows={2}
              className="flex-1 text-sm"
              autoFocus
            />
            <div className="flex flex-col gap-1">
              <Button
                size="sm"
                variant="default"
                onClick={() => handleReply(comment.id)}
                disabled={loading || !replyContent.trim()}
              >
                <IconSend className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setReplyTo(null)}>
                <IconX className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-[380px] flex-col sm:w-[420px]">
        <SheetHeader>
          <SheetTitle>Comments ({comments.length})</SheetTitle>
        </SheetHeader>

        {/* Comment list */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {topLevel.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No comments yet. Start the conversation!
            </p>
          )}
          {topLevel.map((c) => renderComment(c))}
        </div>

        {/* New comment */}
        <div className="border-t pt-3 space-y-2">
          <Textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Add a comment…"
            rows={3}
            className="text-sm"
          />
          <Button
            className="w-full"
            size="sm"
            onClick={handleSubmit}
            disabled={loading || !newContent.trim()}
          >
            <IconSend className="mr-1.5 h-3.5 w-3.5" />
            Comment
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
