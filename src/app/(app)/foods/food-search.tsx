"use client";

import { useEffect, useState } from "react";
import { Pager } from "@/components/pager";
import { Input, TrustBadge } from "@/components/ui";

type Food = {
  id: string;
  name: string;
  brand: string | null;
  confidence: "verified" | "estimated" | "rough";
  kcal_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
};

const oneDecimal = (n: number) => Math.round(n * 10) / 10;

type Status = "idle" | "loading" | "done" | "error";

export function FoodSearch() {
  const [query, setQuery] = useState("");
  const [foods, setFoods] = useState<Food[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [attempt, setAttempt] = useState(0);
  const term = query.trim();

  useEffect(() => {
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("loading");
      try {
        const response = await fetch(`/api/foods/search?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Search returned ${response.status}`);
        setFoods((await response.json()).foods);
        setStatus("done");
      } catch (error) {
        if ((error as Error).name !== "AbortError") setStatus("error");
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term, attempt]);

  const showResults = term.length >= 2;

  return (
    <>
      <Input
        type="search"
        aria-label="Food name"
        placeholder="Oats, milk, chicken breast"
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {showResults && status === "error" ? (
        <p role="alert" className="text-sm text-error">
          Search didn&apos;t finish. Check your connection and{" "}
          <button type="button" className="underline underline-offset-4" onClick={() => setAttempt(attempt + 1)}>try again</button>.
        </p>
      ) : null}
      {showResults && status === "done" && foods.length === 0 ? (
        <p className="text-sm text-muted">No foods match &quot;{term}&quot;. Try a simpler name.</p>
      ) : null}
      {showResults && foods.length > 0 ? (
        <>
          <p className="text-sm text-muted">Values per 100 g</p>
          <div className="min-h-0 flex-1">
            <Pager
              key={foods.map((food) => food.id).join()}
              label="Search results"
              items={foods}
              rowHeight={80}
              renderRow={(food) => (
                <div className="flex h-full flex-col justify-center gap-1">
                  <p className="line-clamp-2 text-sm leading-tight font-medium">{food.name}{food.brand ? `, ${food.brand}` : ""}</p>
                  <div className="flex items-center gap-2 text-sm whitespace-nowrap text-muted tabular-nums">
                    <TrustBadge confidence={food.confidence} />
                    <span>{Math.round(food.kcal_per_100g)} kcal</span>
                    <span>P {oneDecimal(food.protein_per_100g)}</span>
                    <span>C {oneDecimal(food.carbs_per_100g)}</span>
                    <span>F {oneDecimal(food.fat_per_100g)}</span>
                  </div>
                </div>
              )}
            />
          </div>
        </>
      ) : null}
    </>
  );
}
