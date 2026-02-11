// hooks/useRowsVirtual.ts
import * as React from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

type FetchArgs = {
  tableId: string;
  pageSize: number;
  searchQuery?: string;
  searchScope?: 'global' | string;
  applyFilters?: boolean;
  applySorts?: boolean;
  listRows: (
    tableId: string,
    applyFilters: boolean,
    applySorts: boolean,
    limit: number,
    offset: number
  ) => Promise<{ items: any[]; total: number }>;
  searchRows: (
    tableId: string,
    q: string,
    scope: string,
    limit: number,
    offset: number
  ) => Promise<{ items: any[]; total: number }>;
};

export function useRowsVirtual({
  tableId,
  pageSize,
  searchQuery,
  searchScope = 'global',
  applyFilters = true,
  applySorts = true,
  listRows,
  searchRows,
}: FetchArgs) {
  const queryClient = useQueryClient();

  // Stable query key for data window
  const qKey = React.useMemo(
    () =>
      searchQuery
        ? ['rows', tableId, 'search', searchQuery, searchScope, pageSize]
        : ['rows', tableId, 'list', applyFilters, applySorts, pageSize],
    [tableId, pageSize, searchQuery, searchScope, applyFilters, applySorts]
  );

  const fetchPage = async ({ pageParam = 0 }) => {
    const offset = pageParam * pageSize;
    const limit = pageSize;

    if (searchQuery) {
      return searchRows(tableId, searchQuery, searchScope, limit, offset);
    }
    return listRows(tableId, applyFilters, applySorts, limit, offset);
  };

  const query = useInfiniteQuery({
    queryKey: qKey,
    queryFn: fetchPage,
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((acc, p) => acc + (p.items?.length ?? 0), 0);
      const total = last?.total ?? 0;
      return loaded < total ? all.length : undefined;
    },
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    keepPreviousData: true,
  });

  const flat = React.useMemo(
    () => query.data?.pages.flatMap((p) => p.items ?? []) ?? [],
    [query.data]
  );

  const total =
    query.data?.pages.length
      ? query.data.pages[0].total // total is consistent across pages
      : 0;

  // Prefetch helper: when virtualizer reaches near the end of loaded rows, fetch next page
  const ensureLoadedForIndex = React.useCallback(
    (index: number, prefetchThreshold = Math.max(10, Math.floor(pageSize / 2))) => {
      const loaded = flat.length;
      if (total === 0) return;
      if (index >= loaded - prefetchThreshold && query.hasNextPage && !query.isFetching) {
        query.fetchNextPage();
      }
    },
    [flat.length, pageSize, query.hasNextPage, query.isFetching, query.fetchNextPage, total]
  );

  // True when some part of [start, end] is not yet loaded and a fetch is in flight
  const isLoadingRange = React.useCallback(
    (start: number, end: number) => {
      if (total === 0) return query.isFetching || query.isLoading;
      const loaded = flat.length - 1;
      const needs =
        start > loaded || end > loaded; // asking beyond what’s loaded
      return needs && (query.isFetching || query.isLoading);
    },
    [flat.length, total, query.isFetching, query.isLoading]
  );

  // Random access by global index
  const getRow = React.useCallback(
    (index: number) => flat[index],
    [flat]
  );

  // Add manual invalidation helper
  const invalidate = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: qKey });
  }, [queryClient, qKey]);

  return {
    total,
    rowsLoaded: flat.length,
    getRow,
    ensureLoadedForIndex,
    isLoadingRange,
    isLoading: query.isLoading,
    refetch: query.refetch,
    reset: query.remove,
    invalidate, // NEW: expose invalidation
  };
}
