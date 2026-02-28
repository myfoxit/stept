import React from 'react';
import { SettingsTabs } from '@/components/settings-tabs';
import { SiteHeader } from '@/components/site-header';

export function SettingsLayout({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader
        breadcrumbs={[
          { label: 'Settings' },
          { label: title },
        ]}
      />
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">{title}</h1>
          {description && (
            <p className="text-muted-foreground">{description}</p>
          )}
        </div>
        <SettingsTabs />
        {children}
      </div>
    </>
  );
}
