"use client";

import { Pager } from "@/components/pager";

type Item = { id: string; label: string; kcal: number };

export function MealItems({ items }: { items: Item[] }) {
  return (
    <Pager
      label="Items"
      items={items}
      rowHeight={56}
      renderRow={(item) => (
        <div className="flex h-full items-center justify-between gap-4 text-sm">
          <span className="truncate">{item.label}</span>
          <span className="shrink-0 text-muted tabular-nums">{item.kcal} kcal</span>
        </div>
      )}
    />
  );
}
