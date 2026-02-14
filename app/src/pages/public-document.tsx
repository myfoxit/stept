/**
 * Public document viewer — read-only, no auth required.
 */
import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/apiClient';
import { TipTapRenderer } from '@/components/tiptap-renderer';

async function fetchPublicDocument(token: string) {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl.replace('/api/v1', '')}/api/v1/public/document/${token}`);
  if (res.status === 403) {
    throw new Error('access_denied');
  }
  if (!res.ok) throw new Error('not_found');
  return res.json();
}

export function PublicDocumentPage() {
  const { token } = useParams<{ token: string }>();
  const { data: doc, isLoading, error } = useQuery({
    queryKey: ['public-document', token],
    queryFn: () => fetchPublicDocument(token!),
    enabled: !!token,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (error || !doc) {
    const isAccessDenied = error instanceof Error && error.message === 'access_denied';
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md px-4">
          {isAccessDenied ? (
            <>
              <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🔒</span>
              </div>
              <h1 className="text-2xl font-bold mb-2">Access Required</h1>
              <p className="text-muted-foreground mb-6">
                This document is private. Ask the owner to share it with you.
              </p>
              <a
                href="/"
                className="inline-flex items-center px-4 py-2 rounded-md bg-violet-600 text-white hover:bg-violet-700 text-sm font-medium"
              >
                Go to Ondoki
              </a>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold mb-2">Document not found</h1>
              <p className="text-muted-foreground">This link may have expired or been removed.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-8">{doc.name || 'Untitled Document'}</h1>
        <TipTapRenderer content={doc.content} />
        <div className="mt-16 pt-8 border-t text-center text-sm text-muted-foreground">
          <p>
            Made with{' '}
            <a href="/" className="text-violet-600 hover:underline font-medium">Ondoki</a>
          </p>
        </div>
      </div>
    </div>
  );
}
