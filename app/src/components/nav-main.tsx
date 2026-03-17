'use client';

import type { LucideIcon } from 'lucide-react';
import { useLocation } from 'react-router-dom';

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import React from 'react';
import { Link } from 'react-router-dom';

export function NavMain({
  items,
}: {
  items: {
    title: string;
    url: string;
    icon?: LucideIcon;
  }[];
}) {
  const location = useLocation();

  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent className="flex flex-col gap-2">
          <SidebarMenu>
            {items.map((item) => {
              const isActive = location.pathname === item.url || location.pathname.startsWith(item.url + '/');
              return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    asChild={item.url !== '#'}
                    data-active={isActive || undefined}
                  >
                    {item.url !== '#' ? (
                      <Link to={item.url}>
                        {item.icon && <item.icon className="size-4 opacity-50" strokeWidth={1.5} />}
                        <span className="text-[0.82rem] font-medium">{item.title}</span>
                      </Link>
                    ) : (
                      <>
                        {item.icon && <item.icon className="size-4 opacity-50" strokeWidth={1.5} />}
                        <span className="text-[0.82rem] font-medium">{item.title}</span>
                      </>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      
    </>
  );
}
