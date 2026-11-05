"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "./ui";

const BAR_HEIGHT = 56;

/**
 * Shows as many fixed-height rows as fit and pages through the rest, because
 * screens don't scroll. Remount with a new key to return to the first page.
 */
export function Pager<T>({
  items,
  rowHeight,
  renderRow,
  label,
}: {
  items: T[];
  rowHeight: number;
  renderRow: (item: T) => ReactNode;
  label: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [requestedPage, setPage] = useState(0);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setHeight(element.clientHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The Previous and Next bar only takes space when the rows really don't all fit.
  const fitsWithoutBar = Math.floor(height / rowHeight) >= items.length;
  const perPage = fitsWithoutBar ? items.length : Math.max(1, Math.floor((height - BAR_HEIGHT) / rowHeight));
  const pages = Math.max(1, Math.ceil(items.length / Math.max(perPage, 1)));
  const page = Math.min(requestedPage, pages - 1);
  const visible = items.slice(page * perPage, (page + 1) * perPage);

  return (
    <div ref={container} className="flex h-full flex-col gap-3">
      <div className="min-h-0 flex-1 overflow-hidden">
        <ul aria-label={label} className="divide-y divide-border">
          {visible.map((item, index) => (
            <li key={index} style={{ height: rowHeight }} className="overflow-hidden">
              {renderRow(item)}
            </li>
          ))}
        </ul>
      </div>
      {pages > 1 ? (
        <div className="flex shrink-0 items-center justify-between gap-3">
          <Button type="button" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="text-sm text-muted tabular-nums">{page + 1} of {pages}</span>
          <Button type="button" variant="secondary" disabled={page === pages - 1} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      ) : null}
    </div>
  );
}
