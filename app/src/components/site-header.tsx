import { ReactNode } from 'react';
import { IconMessageCircle } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from './tiptap-templates/simple/notion-like-editor-theme-toggle';
import { useChat } from '@/components/Chat/ChatContext';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';

export function SiteHeader({
  name = 'Documents',
  breadcrumbs,
  children,
}: {
  name?: string;
  breadcrumbs?: { label: string; href?: string }[];
  children?: ReactNode;
}) {
  const { togglePanel, isOpen } = useChat();
  const { state, isMobile } = useSidebar();
  const showTrigger = state === 'collapsed' || isMobile;

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b border-border transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        {showTrigger && <SidebarTrigger className="size-7 -ml-1 mr-1" />}
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <nav className="flex items-center gap-1.5 text-[0.8rem]">
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-[#D6D3D1] text-[0.65rem]">›</span>}
                <span className={i === breadcrumbs.length - 1 ? 'font-semibold text-[#1C1917]' : 'font-medium text-[#A8A29E] hover:text-[#D94F3D] cursor-pointer transition-colors'}>
                  {crumb.label}
                </span>
              </span>
            ))}
          </nav>
        ) : (
          <h1 className="text-base font-medium">{name}</h1>
        )}
        <div className="ml-auto flex items-center gap-1.5">
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
