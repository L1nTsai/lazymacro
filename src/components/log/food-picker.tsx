"use client";

import { useEffect, useState } from "react";
import { Pager } from "@/components/pager";
import { Input, TrustBadge } from "@/components/ui";
import type { DraftFood, Trust } from "@/lib/logging/types";

type Result = { id: string; name: string; brand: string | null; confidence: Trust; kcal_per_100g: number };

export function FoodPicker({ initialQuery = "", onPick }: { initialQuery?: string; onPick: (food: DraftFood) => void }) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<Result[]>([]);
  const [status, setStatus] = useState<"idle" | "done" | "error">("idle");
  const term = query.trim();

  useEffect(() => {
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/foods/search?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        if (!response.ok) throw new Error(String(response.status));
        setResults((await response.json()).foods);
        setStatus("done");
      } catch (error) {
        if ((error as Error).name !== "AbortError") setStatus("error");
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  const choose = async (id: string) => {
    try {
      const response = await fetch(`/api/foods/${id}`);
      if (!response.ok) throw new Error(String(response.status));
      onPick((await response.json()).food);
    } catch {
      setStatus("error");
    }
  };

  const showResults = term.length >= 2;

  return (
    <div className="flex h-full flex-col gap-3">
      <Input type="search" aria-label="Food name" placeholder="Search foods" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} />
      {showResults && status === "error" ? <p role="alert" className="text-sm text-error">That didn&apos;t load. Check your connection and try again.</p> : null}
      {showResults && status === "done" && results.length === 0 ? <p className="text-sm text-muted">No foods match &quot;{term}&quot;.</p> : null}
      {showResults && results.length > 0 ? (
        <div className="min-h-0 flex-1">
          <Pager
            key={results.map((r) => r.id).join()}
            label="Matching foods"
            items={results}
            rowHeight={68}
            renderRow={(food) => (
              <button type="button" onClick={() => choose(food.id)} className="flex h-full w-full flex-col justify-center gap-1 text-left">
                <span className="line-clamp-1 text-sm font-medium">{food.name}{food.brand ? `, ${food.brand}` : ""}</span>
                <span className="flex items-center gap-2 text-sm text-muted tabular-nums">
                  <TrustBadge confidence={food.confidence} />
                  {Math.round(food.kcal_per_100g)} kcal per 100 g
                </span>
              </button>
            )}
          />
        </div>
      ) : null}
    </div>
  );
}
