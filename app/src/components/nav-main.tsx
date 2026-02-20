'use client';

import type { LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
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
    group?: string;
  }[];
}) {
  // Split items into groups
  const mainItems = items.filter((i) => !i.group || i.group === 'main');
  const insightsItems = items.filter((i) => i.group === 'insights');

  const renderItems = (groupItems: typeof items) => (
    <SidebarMenu>
      {groupItems.map((item) => (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton tooltip={item.title} asChild={item.url !== '#'}>
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
      ))}
    </SidebarMenu>
  );

  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent className="flex flex-col gap-2">
          <SidebarMenu></SidebarMenu>
          {renderItems(mainItems)}
        </SidebarGroupContent>
      </SidebarGroup>
      {insightsItems.length > 0 && (
        <>
          <SidebarSeparator />
          <SidebarGroup>
            <SidebarGroupLabel className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-[#D6D3D1]">
              Insights
            </SidebarGroupLabel>
            <SidebarGroupContent>
              {renderItems(insightsItems)}
            </SidebarGroupContent>
          </SidebarGroup>
        </>
      )}
      <SidebarSeparator />
    </>
  );
}
