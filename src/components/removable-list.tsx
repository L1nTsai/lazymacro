"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pager } from "./pager";
import { FormError } from "./ui";

export type RemovableItem = { key: string; title: string; detail: string; deleteUrl: string };

/** Pages through saved things, each with a Remove button. */
export function RemovableList({ items, label }: { items: RemovableItem[]; label: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const remove = async (item: RemovableItem) => {
    setError(null);
    try {
      const response = await fetch(item.deleteUrl, { method: "DELETE" });
      if (!response.ok) throw new Error(String(response.status));
      router.refresh();
    } catch {
      setError("That wasn't removed. Try again.");
    }
  };

  return (
    <div className="flex h-full flex-col gap-2">
      <FormError message={error} />
      <div className="min-h-0 flex-1">
        <Pager
          key={items.map((item) => item.key).join()}
          label={label}
          items={items}
          rowHeight={60}
          renderRow={(item) => (
            <div className="flex h-full items-center justify-between gap-3 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">{item.title}</span>
                <span className="block truncate text-muted">{item.detail}</span>
              </span>
              <button type="button" onClick={() => remove(item)} className="min-h-11 shrink-0 px-2 text-error">Remove</button>
            </div>
          )}
        />
      </div>
    </div>
  );
}
