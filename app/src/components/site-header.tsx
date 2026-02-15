import { ReactNode } from 'react';
import { IconMessageCircle, IconSearch } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { ThemeToggle } from './tiptap-templates/simple/notion-like-editor-theme-toggle';
import { useChat } from '@/components/Chat/ChatContext';
import { SearchBar } from '@/components/search/SearchResults';
import { useSpotlight } from '@/components/spotlight/SpotlightProvider';

export function SiteHeader({
  name = 'Documents',
  children,
}: {
  name?: string;
  children?: ReactNode;
}) {
  const { togglePanel, isOpen } = useChat();
  const { openSpotlight } = useSpotlight();

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b border-border transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium">{name}</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="hidden h-8 gap-2 text-muted-foreground sm:flex"
            onClick={openSpotlight}
          >
            <IconSearch className="h-4 w-4" />
            <span className="text-xs">Search...</span>
            <kbd className="pointer-events-none ml-2 inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              ⌘K
            </kbd>
          </Button>
          <SearchBar className="sm:hidden" />
          {children}
          <Button
            variant={isOpen ? 'default' : 'ghost'}
            size="icon"
            onClick={togglePanel}
            title="AI Chat"
            className="h-8 w-8"
          >
            <IconMessageCircle className="h-4 w-4" />
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
