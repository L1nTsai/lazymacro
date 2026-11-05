"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AmountEditor, recalculate } from "@/components/log/amount-editor";
import { FoodPicker } from "@/components/log/food-picker";
import { Button, FormError, SubPage } from "@/components/ui";
import type { DraftFood } from "@/lib/logging/types";

type Initial = { food: DraftFood; quantity: number; unit: string; grams: number; phrase: string | null };

export function EntryEditor({ id, back, initial }: { id: string; back: string; initial: Initial }) {
  const router = useRouter();
  const [food, setFood] = useState(initial.food);
  const [quantityText, setQuantityText] = useState(String(initial.quantity));
  const [unit, setUnit] = useState(initial.unit);
  const [grams, setGrams] = useState(initial.grams);
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Keeps a saved serving's weight when only the count changes.
  const perUnit = (nextUnit: string) => (nextUnit === initial.unit ? initial.grams / initial.quantity : null);
  const change = (nextQuantity: string, nextUnit: string, nextFood = food) => {
    setQuantityText(nextQuantity);
    setUnit(nextUnit);
    const value = Number(nextQuantity);
    if (value > 0) setGrams(recalculate(nextFood, value, nextUnit, nextFood === initial.food ? perUnit(nextUnit) : null).grams);
  };

  const leave = () => {
    // An entry changed, so clear cached pages first; otherwise the list we're
    // going to would come from the cache with the old numbers.
    router.refresh();
    router.push(back, { transitionTypes: ["nav-back"] });
  };

  const send = async (method: "PATCH" | "DELETE") => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/log-entries/${id}`, {
        method,
        headers: { "content-type": "application/json" },
        body: method === "PATCH" ? JSON.stringify({ food, quantity: Number(quantityText), unit, grams }) : undefined,
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error);
        return;
      }
      leave();
    } catch {
      setError("You're offline or the connection dropped. Your change is still here. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SubPage title={choosing ? "Change food" : "Edit item"} back={back}>
      {choosing ? (
        <FoodPicker
          initialQuery={food.name.split(",")[0]}
          onPick={(picked) => {
            setFood(picked);
            setChoosing(false);
            change(quantityText, unit, picked);
          }}
        />
      ) : (
        <div className="flex h-full flex-col gap-4">
          <p className="line-clamp-2 shrink-0 text-sm font-medium">{food.name}</p>
          <AmountEditor food={food} quantityText={quantityText} unit={unit} grams={grams} onQuantity={(value) => change(value, unit)} onUnit={(value) => change(quantityText, value)} />
          <FormError message={error} />
          <div className="mt-auto grid shrink-0 grid-cols-2 gap-2">
            <Button type="button" variant="secondary" onClick={() => setChoosing(true)}>Change food</Button>
            <Button type="button" variant="danger" disabled={busy} onClick={() => send("DELETE")}>Remove</Button>
          </div>
          <Button type="button" className="w-full shrink-0" disabled={busy || !(Number(quantityText) > 0)} onClick={() => send("PATCH")}>Save</Button>
        </div>
      )}
    </SubPage>
  );
}
