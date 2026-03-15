import { Label } from '@/components/ui/label.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
} from '@tabler/icons-react';

export type PaginationController = {
  mode: 'pages' | 'infinite';
  pageIndex: number;
  pageSize: number;
  setPageIndex: (index: number) => void;
  setPageSize: (size: number) => void;

  // navigation
  next: () => void;
  previous: () => void;

  // capability flags
  canPrevious: boolean;
  canNext: boolean;

  // optional totals for page mode
  total?: number;
  pageCount?: number;
};

export function PaginationControls({
  controller,
  className = '',
  embedded = false,
}: {
  controller: PaginationController;
  className?: string;
  embedded?: boolean;
}) {
  const {
    mode,
    pageIndex,
    pageSize,
    setPageIndex,
    setPageSize,
    next,
    previous,
    canPrevious,
    canNext,
    total,
    pageCount,
  } = controller;

  // derive totals for "pages" mode
  const derivedPageCount =
    pageCount ??
    (total !== undefined
      ? Math.max(1, Math.ceil(total / Math.max(1, pageSize)))
      : 1);

  // classes to emulate mobile when embedded
  const totalsLeftClass = embedded
    ? 'hidden'
    : 'text-muted-foreground hidden flex-1 text-sm lg:flex';
  const rowsPerPageContainerClass = embedded
    ? 'hidden'
    : 'hidden items-center gap-2 lg:flex';
  const firstLastHiddenClass = embedded ? 'hidden' : 'hidden lg:flex';
  const infiniteTotalsClass = embedded ? 'hidden' : 'text-muted-foreground text-sm';

  if (mode === 'infinite') {
    // Placeholder UI for future infinite scrolling – easy to swap later
    return (
      <div className={`flex items-center justify-end gap-2 ${className}`}>
        <div className={infiniteTotalsClass}>
          {total !== undefined ? `${total} total` : ''}
        </div>
        <Button
          variant="outline"
          className="size-8"
          size="icon"
          onClick={next}
          disabled={!canNext}
        >
          <span className="sr-only">Load more</span>
          <IconChevronRight />
        </Button>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-between ${className}`}>
      <div className={totalsLeftClass}>
        {total !== undefined ? `${total} total` : ''}
      </div>

      <div className="flex w-full items-center gap-8 lg:w-fit">
        <div className={`${rowsPerPageContainerClass}`}>
          <Label htmlFor="rows-per-page" className="text-sm font-medium">
            Rows per page
          </Label>
          <Select
            value={`${pageSize}`}
            onValueChange={(v) => {
              // reset to first page when page size changes
              setPageSize(Number(v));
              setPageIndex(0);
            }}
          >
            <SelectTrigger size="sm" className="w-20" id="rows-per-page">
              <SelectValue placeholder={pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 20, 50, 100].map((ps) => (
                <SelectItem key={ps} value={`${ps}`}>
                  {ps}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex w-fit items-center justify-center text-sm font-medium">
          Page {pageIndex + 1} of {derivedPageCount}
        </div>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <Button
            variant="outline"
            className={`${firstLastHiddenClass} h-8 w-8 p-0`}
            onClick={() => setPageIndex(0)}
            disabled={!canPrevious}
          >
            <span className="sr-only">Go to first page</span>
            <IconChevronsLeft />
          </Button>
          <Button
            variant="outline"
            className="size-8"
            size="icon"
            onClick={previous}
            disabled={!canPrevious}
          >
            <span className="sr-only">Go to previous page</span>
            <IconChevronLeft />
          </Button>
          <Button
            variant="outline"
            className="size-8"
            size="icon"
            onClick={next}
            disabled={!canNext}
          >
            <span className="sr-only">Go to next page</span>
            <IconChevronRight />
          </Button>
          <Button
            variant="outline"
            className={`${firstLastHiddenClass} size-8`}
            size="icon"
            onClick={() => setPageIndex(derivedPageCount - 1)}
            disabled={!canNext}
          >
            <span className="sr-only">Go to last page</span>
            <IconChevronsRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
