/**
 * Mention suggestion configuration for the TipTap Mention extension.
 * Fetches users and shows them in a dropdown when typing @.
 */
import { ReactRenderer } from '@tiptap/react';
import { listUsers } from '@/api/users';
import type { UserRead } from '@/types/openapi';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  useCallback,
} from 'react';

interface MentionListProps {
  items: UserRead[];
  command: (item: { id: string; label: string }) => void;
}

interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const MentionList = forwardRef<MentionListRef, MentionListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => setSelectedIndex(0), [items]);

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index];
        if (item) {
          command({ id: item.id, label: item.name || item.email });
        }
      },
      [items, command],
    );

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((prev) => (prev + items.length - 1) % items.length);
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((prev) => (prev + 1) % items.length);
          return true;
        }
        if (event.key === 'Enter') {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }));

    if (!items.length) {
      return (
        <div className="z-50 rounded-lg border bg-background p-2 shadow-lg text-sm text-muted-foreground">
          No users found
        </div>
      );
    }

    return (
      <div className="z-50 rounded-lg border bg-background shadow-lg overflow-hidden min-w-[180px]">
        {items.map((item, index) => (
          <button
            key={item.id}
            className={`flex w-full items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent ${
              index === selectedIndex ? 'bg-accent' : ''
            }`}
            onClick={() => selectItem(index)}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
              {(item.name || item.email || '?')[0].toUpperCase()}
            </span>
            <div className="flex flex-col">
              <span className="font-medium">{item.name || 'Unknown'}</span>
              {item.email && (
                <span className="text-xs text-muted-foreground">
                  {item.email}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    );
  },
);

MentionList.displayName = 'MentionList';

// Cache users to avoid refetching on every keystroke
let cachedUsers: UserRead[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60_000; // 1 minute

async function fetchUsers(): Promise<UserRead[]> {
  const now = Date.now();
  if (cachedUsers && now - cacheTimestamp < CACHE_TTL) {
    return cachedUsers;
  }
  try {
    const users = await listUsers();
    cachedUsers = users;
    cacheTimestamp = now;
    return users;
  } catch (err) {
    console.error('Failed to fetch users for mentions:', err);
    return cachedUsers || [];
  }
}

export const mentionSuggestion = {
  items: async ({ query }: { query: string }) => {
    const users = await fetchUsers();
    const q = query.toLowerCase();
    return users
      .filter(
        (u) =>
          u.name?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q),
      )
      .slice(0, 8);
  },

  render: () => {
    let component: ReactRenderer<MentionListRef> | null = null;
    let popup: HTMLDivElement | null = null;

    return {
      onStart: (props: any) => {
        component = new ReactRenderer(MentionList, {
          props,
          editor: props.editor,
        });

        popup = document.createElement('div');
        popup.style.position = 'absolute';
        popup.style.zIndex = '9999';
        if (component.element) {
          popup.appendChild(component.element);
        }
        document.body.appendChild(popup);

        if (props.clientRect) {
          const rect = props.clientRect();
          if (rect) {
            popup.style.left = `${rect.left}px`;
            popup.style.top = `${rect.bottom + 4}px`;
          }
        }
      },

      onUpdate: (props: any) => {
        component?.updateProps(props);
        if (popup && props.clientRect) {
          const rect = props.clientRect();
          if (rect) {
            popup.style.left = `${rect.left}px`;
            popup.style.top = `${rect.bottom + 4}px`;
          }
        }
      },

      onKeyDown: (props: any) => {
        if (props.event.key === 'Escape') {
          popup?.remove();
          return true;
        }
        return component?.ref?.onKeyDown(props) ?? false;
      },

      onExit: () => {
        popup?.remove();
        component?.destroy();
      },
    };
  },
};
