/**
 * Public document viewer — read-only, no auth required.
 */
import React from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/apiClient';
import { EditorRenderer } from '@/components/Editor/Renderer';
import { ContentLanguageToggle } from '@/components/ui/content-language-toggle';

async function fetchPublicDocument(token: string, lang?: string) {
  const baseUrl = getApiBaseUrl();
  const langParam = lang && lang !== 'original' ? `?lang=${lang}` : '';
  const res = await fetch(`${baseUrl.replace('/api/v1', '')}/api/v1/public/document/${token}${langParam}`);
  if (res.status === 403) {
    throw new Error('access_denied');
  }
  if (!res.ok) throw new Error('not_found');
  return res.json();
}

export function PublicDocumentPage() {
  const { token } = useParams<{ token: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const langParam = searchParams.get('lang') || 'original';

  const setLang = (lang: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (lang === 'original') {
        next.delete('lang');
      } else {
        next.set('lang', lang);
      }
      return next;
    }, { replace: true });
  };

  const { data: doc, isLoading, isFetching, error } = useQuery({
    queryKey: ['public-document', token, langParam],
    queryFn: () => fetchPublicDocument(token!, langParam !== 'original' ? langParam : undefined),
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
                Go to Stept
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
        <div className="flex items-center justify-between gap-4 mb-8">
          <h1 className="text-3xl font-bold">{doc.name || 'Untitled Document'}</h1>
          <ContentLanguageToggle
            value={langParam}
            onChange={setLang}
            loading={isFetching && langParam !== 'original'}
          />
        </div>
        <EditorRenderer content={doc.content} documentShareToken={token} />
        <div className="mt-16 pt-8 border-t text-center text-sm text-muted-foreground">
          <p>
            Made with{' '}
            <a href="/" className="text-violet-600 hover:underline font-medium">Stept</a>
          </p>
        </div>
      </div>
    </div>
  );
}
