"use client";

import Link from "next/link";
import { Pager } from "@/components/pager";
import { TrustBadge } from "@/components/ui";

type Item = { id: string; label: string; kcal: number; trust: "verified" | "estimated" | "rough" };

export function MealItems({ items, back }: { items: Item[]; back: string }) {
  return (
    <Pager
      label="Items"
      items={items}
      rowHeight={64}
      renderRow={(item) => (
        <Link
          href={`/meals/entry/${item.id}?back=${encodeURIComponent(back)}`}
          transitionTypes={["nav-forward"]}
          className="flex h-full flex-col justify-center gap-1 text-sm"
        >
          <span className="flex items-baseline justify-between gap-4">
            <span className="truncate font-medium">{item.label}</span>
            <span className="shrink-0 text-muted tabular-nums">{item.kcal} kcal</span>
          </span>
          <span><TrustBadge confidence={item.trust} /></span>
        </Link>
      )}
    />
  );
}
