import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Play,
  Share2,
  Eye,
  Pencil,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import { useSharedWithMe } from '@/hooks/use-share';
import { SiteHeader } from '@/components/site-header';
import { Badge } from '@/components/ui/badge';
import type { SharedWithMeItem } from '@/api/sharing';

function SharedItemCard({
  item,
  onClick,
}: {
  item: SharedWithMeItem;
  onClick: () => void;
}) {
  const isWorkflow = item.resource_type === 'workflow';
  const displayName = item.resource.name || 'Untitled';

  return (
    <div
      className="group relative flex flex-col rounded-lg border border-muted bg-muted/30 hover:bg-muted/40 transition cursor-pointer p-4"
      onClick={onClick}
    >
      <div className="flex w-full items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted border border-muted-foreground/10">
          {isWorkflow ? (
            <Play className="size-6 text-blue-600" />
          ) : (
            <FileText className="size-6 text-violet-600" />
          )}
        </div>
        <div className="flex-1 space-y-2 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-sm truncate">{displayName}</h3>
            <Badge
              variant={item.permission === 'edit' ? 'default' : 'secondary'}
              className="shrink-0 text-[10px] px-1.5 py-0"
            >
              {item.permission === 'edit' ? (
                <Pencil className="size-3 mr-0.5 inline" />
              ) : (
                <Eye className="size-3 mr-0.5 inline" />
              )}
              {item.permission}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              {isWorkflow ? 'Workflow' : 'Page'}
            </span>
            <span>·</span>
            <span>Shared by {item.shared_by_name}</span>
            {item.shared_at && (
              <>
                <span>·</span>
                <span>
                  {formatDistanceToNow(new Date(item.shared_at), {
                    addSuffix: true,
                  })}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SharedWithMePage() {
  const navigate = useNavigate();
  const { items, isLoading } = useSharedWithMe();

  function handleClick(item: SharedWithMeItem) {
    if (item.resource_type === 'workflow') {
      navigate(`/workflow/${item.resource_id}`);
    } else {
      navigate(`/editor/${item.resource_id}`);
    }
  }

  return (
    <>
      <SiteHeader name="Shared with me" />
      <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-lg bg-muted/50"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Share2 className="size-12 text-muted-foreground/40 mb-4" />
            <h2 className="text-lg font-medium text-muted-foreground">
              Nothing shared with you yet
            </h2>
            <p className="text-sm text-muted-foreground/70 mt-1">
              When someone shares a page or workflow with you, it will appear
              here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <SharedItemCard
                key={item.id}
                item={item}
                onClick={() => handleClick(item)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
