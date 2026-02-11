// SelectionOverlay.tsx
import * as React from "react";
import { useActiveCellStore } from "@/lib/active-cell-store";
import { cn } from "@/lib/utils";
import { useSpreadsheet } from "./SpreadsheetContext";

interface SelectionOverlayProps {
  scrollEl: HTMLElement | null;
  // new (optional) – used to trigger repositions on column/row size changes
  colOffsets?: number[];
  rowHeight?: number;
}

export function SelectionOverlay({ scrollEl, colOffsets, rowHeight }: SelectionOverlayProps) {
  const activeCell = useActiveCellStore();
  const { lastAddedRowIndex } = useSpreadsheet();
  const [position, setPosition] = React.useState({ x: 0, y: 0, width: 0, height: 0 });
  // NEW: row highlight band position
  const [rowPos, setRowPos] = React.useState<{ y: number; h: number } | null>(null);
  const [isVisible, setIsVisible] = React.useState(false);
  const rafRef = React.useRef<number>();
  const lastCellRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!scrollEl) {
      setIsVisible(false);
      setRowPos(null);
      return;
    }

    const updatePosition = () => {
      // selection ring
      if (activeCell) {
        const cellEl = scrollEl.querySelector(
          `[data-sr-row="${activeCell.row}"][data-sr-col="${activeCell.col}"]`
        ) as HTMLElement | null;

        lastCellRef.current = cellEl ?? null;

        if (!cellEl) {
          setIsVisible(false);
        } else {
          const scrollRect = scrollEl.getBoundingClientRect();
          const cellRect = cellEl.getBoundingClientRect();
          const x = cellRect.left - scrollRect.left + scrollEl.scrollLeft;
          const y = cellRect.top - scrollRect.top + scrollEl.scrollTop;
          setPosition({ x, y, width: cellRect.width, height: cellRect.height });
          setIsVisible(true);
        }
      } else {
        setIsVisible(false);
      }

      // row flash band
      if (lastAddedRowIndex != null) {
        const anyCell = scrollEl.querySelector(
          `[data-sr-row="${lastAddedRowIndex}"]`
        ) as HTMLElement | null;

        if (anyCell) {
          const sRect = scrollEl.getBoundingClientRect();
          const cRect = anyCell.getBoundingClientRect();
          const y = cRect.top - sRect.top + scrollEl.scrollTop;
          setRowPos({ y, h: cRect.height });
        } else {
          setRowPos(null);
        }
      } else {
        setRowPos(null);
      }
    };

    // Initial
    updatePosition();

    // Update on scroll
    const handleScroll = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updatePosition);
    };
    scrollEl.addEventListener("scroll", handleScroll, { passive: true });

    // Update when container resizes (viewport/host)
    const resizeObserver = new ResizeObserver(() => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updatePosition);
    });
    resizeObserver.observe(scrollEl);

    // Update when the actual cell’s box changes (e.g., column resize)
    const cellResizeObserver = new ResizeObserver(() => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updatePosition);
    });
    if (lastCellRef.current) cellResizeObserver.observe(lastCellRef.current);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      scrollEl.removeEventListener("scroll", handleScroll);
      resizeObserver.disconnect();
      cellResizeObserver.disconnect();
    };
  // react to sizing signals and highlight changes
  }, [activeCell, scrollEl, colOffsets, rowHeight, lastAddedRowIndex]);

  return (
    <>
      {rowPos && (
        <div
          className="pointer-events-none absolute z-5 bg-yellow-200/40 transition-opacity"
          style={{
            transform: `translate3d(0, ${rowPos.y}px, 0)`,
            width: '100%',
            height: rowPos.h,
          }}
        />
      )}
      {isVisible && (
        <div
          className={cn(
            "pointer-events-none absolute z-10",
            "ring-2 ring-primary ring-inset"
          )}
          style={{
            transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
            width: position.width,
            height: position.height,
            willChange: "transform",
          }}
        />
      )}
    </>
  );
}

