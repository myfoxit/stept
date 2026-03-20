'use client';

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

export function NavSecondary({
  items,
  projectId,
  ...props
}: {
  items: {
    title: string;
    url: string;
    icon: LucideIcon;
  }[];
  projectId?: string | null;
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const location = useLocation();
  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            // External links
            if (item.url.startsWith('http')) {
              return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton size="sm" className="h-8" asChild>
                    <a href={item.url} target="_blank" rel="noopener noreferrer">
                      <item.icon />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            }

            // Settings → dynamic project settings URL
            if (item.url === 'settings') {
              const settingsUrl = projectId
                ? `/projects/${projectId}/settings`
                : '#';
              const isActive = projectId ? location.pathname.startsWith(`/projects/${projectId}/settings`) : false;
              return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton size="sm" className="h-8" asChild={!!projectId} data-active={isActive || undefined}>
                    {projectId ? (
                      <Link to={settingsUrl}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    ) : (
                      <>
                        <item.icon />
                        <span>{item.title}</span>
                      </>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            }

            // Default internal links
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton size="sm" className="h-8" asChild>
                  <Link to={item.url}>
                    <item.icon />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
