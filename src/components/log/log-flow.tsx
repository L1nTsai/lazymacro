"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { addTransitionType, startTransition, useCallback, useEffect, useRef, useState, ViewTransition, type PointerEvent as ReactPointerEvent } from "react";
import { Pager } from "@/components/pager";
import { Button, Chevron, Field, FormError, Input, NavList, Select, TrustBadge } from "@/components/ui";
import { newClientId } from "@/lib/client-id";
import { macrosFor, servingToPer100g } from "@/lib/logging/amounts";
import type { DraftFood, DraftItem, DraftMeal } from "@/lib/logging/types";
import { AmountEditor, recalculate } from "./amount-editor";
import { FoodPicker } from "./food-picker";
import { useBrowserSpeech } from "./use-browser-speech";
import { useRecorder } from "./use-recorder";

type Stage = "capture" | "type" | "working" | "review" | "item" | "swap" | "add" | "label" | "favorite-name" | "favorites" | "remember";
type Budget = { today: string; kcalLeft: number | null; currentMeal: DraftMeal["mealType"] };
type Favorite = { id: string; name: string; kcal: number };
type Offer = { phrase: string; food_id: string; food_name: string };

const MOTION = { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" };
const MEAL_OPTIONS = [
  ["breakfast", "Breakfast"],
  ["lunch", "Lunch"],
  ["dinner", "Dinner"],
  ["snack", "Snack"],
] as const;

const RECORDER_MESSAGES = {
  unsupported: "The microphone needs a secure (https) connection in this browser. Type your meal instead.",
  denied: "Microphone access is off. Allow it in your browser settings, or type your meal instead.",
  failed: "The microphone didn't start. Try again, or type your meal instead.",
};

const SPEECH_MESSAGES = {
  unsupported: "Voice isn't available in this browser. Try Safari or Chrome, or type your meal instead.",
  denied: "Microphone access is off. Allow it in your browser settings, or type your meal instead.",
  siri: "Voice needs Siri turned on in your iPhone's settings, and speech recognition allowed. Or type your meal instead.",
  "no-speech": "No speech was heard. Try again, or type your meal instead.",
  network: "Voice needs a connection. Check yours and try again, or type your meal instead.",
  failed: "Voice didn't start. Try again, or type your meal instead.",
};

const totalsOf = (items: DraftItem[]) =>
  items.reduce(
    (sum, item) => {
      const macros = macrosFor(item.food, item.grams);
      return { kcal: sum.kcal + macros.kcal, protein: sum.protein + macros.protein, carbs: sum.carbs + macros.carbs, fat: sum.fat + macros.fat };
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );

function draftItemFor(food: DraftFood, phrase: string | null = null): DraftItem {
  return {
    key: newClientId(),
    phrase,
    parsedFood: null,
    dish: null,
    quantity: 100,
    unit: "g",
    grams: 100,
    food,
    adjusted: false,
    corrected: false,
    assumptions: [],
  };
}

function ItemCard({ item, onOpen, onDelete }: { item: DraftItem; onOpen: () => void; onDelete: () => void }) {
  const macros = macrosFor(item.food, item.grams);
  const start = useRef<number | null>(null);
  const moved = useRef(false);
  const [offset, setOffset] = useState(0);

  const onDown = (event: ReactPointerEvent) => {
    start.current = event.clientX;
    moved.current = false;
    // Keeps the swipe going if a finger drifts off the card.
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onMove = (event: ReactPointerEvent) => {
    if (start.current === null) return;
    const delta = event.clientX - start.current;
    if (Math.abs(delta) > 8) moved.current = true;
    setOffset(Math.min(0, delta));
  };
  const onUp = () => {
    start.current = null;
    if (offset < -96) onDelete();
    setOffset(0);
  };

  return (
    <div className="relative h-full overflow-hidden">
      <div className="absolute inset-y-0 right-0 flex w-24 items-center justify-center text-sm font-medium text-error" aria-hidden="true">Delete</div>
      <button
        type="button"
        onClick={() => {
          if (!moved.current) onOpen();
        }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        aria-label={`Edit ${item.food.name}`}
        style={{ transform: `translateX(${offset}px)`, touchAction: "pan-y" }}
        className="relative flex h-full w-full flex-col justify-center gap-1 bg-background text-left"
      >
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-medium">{item.food.name}</span>
          <span className="shrink-0 text-sm font-medium tabular-nums">{Math.round(macros.kcal)} kcal</span>
        </span>
        <span className="flex items-center gap-2 text-sm whitespace-nowrap text-muted tabular-nums">
          <TrustBadge confidence={item.food.trust} />
          <span>{item.grams} g</span>
          <span>P {macros.protein}</span>
          <span>C {macros.carbs}</span>
          <span>F {macros.fat}</span>
        </span>
        {item.assumptions[0] ? (
          <span className="flex items-center gap-2">
            <span className="truncate rounded px-1.5 py-0.5 text-xs font-medium" style={{ background: "var(--status-estimated)", color: "var(--on-status-amber)" }}>
              {item.assumptions[0]}
            </span>
            {item.assumptions.length > 1 ? <span className="shrink-0 text-xs text-muted">+{item.assumptions.length - 1}</span> : null}
          </span>
        ) : null}
      </button>
    </div>
  );
}

export function LogFlow({ budget, browserVoice }: { budget: Budget; browserVoice: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [stage, setStage] = useState<Stage>("capture");
  const [text, setText] = useState("");
  const [workingText, setWorkingText] = useState("Reading your meal");
  const [error, setError] = useState<{ message: string; retry: (() => void) | null } | null>(null);
  const [meals, setMeals] = useState<DraftMeal[]>([]);
  const [mealIndex, setMealIndex] = useState(0);
  const [unresolved, setUnresolved] = useState<string[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [quantityText, setQuantityText] = useState("");
  const [favoriteName, setFavoriteName] = useState("");
  const [saving, setSaving] = useState(false);
  const [favorites, setFavorites] = useState<Favorite[] | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [label, setLabel] = useState({ name: "", kcal: "", protein: "", carbs: "", fat: "", grams: "" });
  const pendingAudio = useRef<Blob | null>(null);
  const oneTapId = useRef(newClientId());
  const autoStarted = useRef(false);
  const retries = useRef<{ parse(input: string, source: "voice" | "text"): void; transcribe(audio: Blob): void }>({ parse: () => {}, transcribe: () => {} });

  const go = useCallback((next: Stage, type: "nav-forward" | "nav-back" = "nav-forward") => {
    (document.activeElement as HTMLElement | null)?.blur();
    startTransition(() => {
      addTransitionType(type);
      setStage(next);
    });
  }, []);

  const finish = useCallback(() => {
    router.push("/", { transitionTypes: ["nav-back"] });
  }, [router]);

  const parse = useCallback(
    async (input: string, source: "voice" | "text") => {
      setError(null);
      setWorkingText("Reading your meal");
      setStage("working");
      try {
        const response = await fetch("/api/parse", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: input, source }),
        });
        const body = await response.json();
        if (!response.ok) {
          setText(input);
          setStage("type");
          setError({ message: body.error, retry: body.retryable ? () => retries.current.parse(input, source) : null });
          return;
        }
        if (body.meals.length === 0) {
          setText(input);
          setStage("type");
          setError({ message: "No food found in that. Try rewording it, or search for the food.", retry: null });
          return;
        }
        setMeals(body.meals);
        setMealIndex(0);
        setUnresolved(body.unresolved);
        go("review");
      } catch {
        setText(input);
        setStage("type");
        setError({ message: "You're offline or the connection dropped. Your text is still here.", retry: () => retries.current.parse(input, source) });
      }
    },
    [go],
  );

  const transcribe = useCallback(
    async (audio: Blob) => {
      pendingAudio.current = audio;
      setError(null);
      setWorkingText("Listening back");
      setStage("working");
      try {
        const form = new FormData();
        form.append("audio", audio);
        const response = await fetch("/api/transcribe", { method: "POST", body: form });
        const body = await response.json();
        if (!response.ok) {
          setStage("capture");
          setError({ message: body.error, retry: body.retryable ? () => retries.current.transcribe(audio) : null });
          return;
        }
        if (!body.transcript) {
          setStage("capture");
          setError({ message: "No speech was heard. Try again, or type your meal instead.", retry: null });
          return;
        }
        pendingAudio.current = null;
        await parse(body.transcript, "voice");
      } catch {
        setStage("capture");
        setError({ message: "You're offline or the connection dropped. Your recording is still here.", retry: () => retries.current.transcribe(audio) });
      }
    },
    [parse],
  );

  useEffect(() => {
    retries.current = { parse, transcribe };
  }, [parse, transcribe]);

  const recorder = useRecorder(transcribe);
  const speech = useBrowserSpeech(useCallback((spoken: string) => void parse(spoken, "voice"), [parse]));
  const voice = browserVoice ? speech : recorder;
  const voiceError = browserVoice ? (speech.error ? SPEECH_MESSAGES[speech.error] : null) : recorder.error ? RECORDER_MESSAGES[recorder.error] : null;

  useEffect(() => {
    if (params.get("start") === "1" && !autoStarted.current) {
      autoStarted.current = true;
      void voice.start();
    }
  }, [params, voice]);

  const meal = meals[mealIndex];
  const active = meal?.items.find((item) => item.key === activeKey) ?? null;

  const updateMeal = (change: Partial<DraftMeal>) => setMeals(meals.map((m, i) => (i === mealIndex ? { ...m, ...change } : m)));
  const updateItem = (key: string, change: Partial<DraftItem>) => updateMeal({ items: meal.items.map((item) => (item.key === key ? { ...item, ...change } : item)) });
  const removeItem = (key: string) => updateMeal({ items: meal.items.filter((item) => item.key !== key) });

  const openItem = (item: DraftItem) => {
    setActiveKey(item.key);
    setQuantityText(String(item.quantity));
    go("item");
  };

  /** A serving of a chain's dish has a known weight the unit list can't express. */
  const gramsPerUnit = (item: DraftItem) => (item.unit === "serving" ? item.grams / item.quantity : null);

  const setAmount = (quantity: string, unit: string) => {
    if (!active) return;
    setQuantityText(quantity);
    const value = Number(quantity);
    if (!(value > 0)) return;
    const { grams } = recalculate(active.food, value, unit, unit === active.unit ? gramsPerUnit(active) : null);
    updateItem(active.key, { quantity: value, unit, grams, assumptions: active.assumptions.filter((a) => !a.startsWith("Assumed 1 ")) });
  };

  const addFood = (food: DraftFood) => {
    if (!meal) {
      const item = draftItemFor(food);
      setMeals([{ clientId: newClientId(), eatenOn: budget.today, mealType: budget.currentMeal, source: "manual", transcript: null, items: [item] }]);
      setMealIndex(0);
    } else {
      updateMeal({ items: [...meal.items, draftItemFor(food)] });
    }
    go("review", "nav-back");
  };

  const swapFood = (food: DraftFood) => {
    if (!active) return;
    const { grams } = recalculate(food, active.quantity, active.unit, null);
    updateItem(active.key, {
      food,
      grams,
      corrected: true,
      assumptions: [],
    });
    go("item", "nav-back");
  };

  const saveLabel = () => {
    const grams = Number(label.grams) || 100;
    const { per100g } = servingToPer100g(
      { kcal: Number(label.kcal), protein: Number(label.protein), carbs: Number(label.carbs), fat: Number(label.fat) },
      grams,
    );
    const food: DraftFood = {
      id: null,
      name: label.name.trim(),
      brand: null,
      trust: "rough",
      sourceUrl: null,
      ...per100g,
      densityGPerMl: null,
      portions: [{ label: "serving", grams }],
      newFood: { source: "custom", sourceId: null },
    };
    const item = { ...draftItemFor(food), quantity: 1, unit: "serving", grams };
    if (!meal) {
      setMeals([{ clientId: newClientId(), eatenOn: budget.today, mealType: budget.currentMeal, source: "manual", transcript: null, items: [item] }]);
      setMealIndex(0);
    } else {
      updateMeal({ items: [...meal.items, item] });
    }
    setLabel({ name: "", kcal: "", protein: "", carbs: "", fat: "", grams: "" });
    go("review", "nav-back");
  };

  const labelValid =
    label.name.trim() !== "" &&
    Number(label.kcal) >= 0 && Number(label.kcal) <= 10000 && label.kcal !== "" &&
    Number(label.protein) >= 0 && label.protein !== "" &&
    Number(label.carbs) >= 0 && label.carbs !== "" &&
    Number(label.fat) >= 0 && label.fat !== "";

  const confirm = async () => {
    setError(null);
    setSaving(true);
    try {
      const response = await fetch("/api/meals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ meals, favoriteName: favoriteName.trim() || null }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError({ message: body.error, retry: confirm });
        return;
      }
      if (body.remember_offers?.length) {
        setOffers(body.remember_offers);
        go("remember");
      } else {
        finish();
      }
    } catch {
      setError({ message: "You're offline or the connection dropped. Your meal is still here, and it won't be logged twice.", retry: confirm });
    } finally {
      setSaving(false);
    }
  };

  const answerOffer = async (remember: boolean) => {
    const [offer, ...rest] = offers;
    if (remember) {
      const response = await fetch("/api/aliases", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phrase: offer.phrase, foodId: offer.food_id, defaultGrams: null }),
      }).catch(() => null);
      if (!response?.ok) {
        setError({ message: "That wasn't saved. Try again.", retry: null });
        return;
      }
    }
    setError(null);
    if (rest.length) setOffers(rest);
    else finish();
  };

  const openFavorites = async () => {
    setError(null);
    go("favorites");
    try {
      const response = await fetch("/api/favorites");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setFavorites(body.favorites);
    } catch {
      setFavorites([]);
      setError({ message: "Favorites didn't load. Try again.", retry: openFavorites });
    }
  };

  const logFavorite = async (favorite: Favorite) => {
    setError(null);
    try {
      const response = await fetch(`/api/favorites/${favorite.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: oneTapId.current }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError({ message: body.error, retry: null });
        return;
      }
      finish();
    } catch {
      setError({ message: "You're offline or the connection dropped. Try again; it won't be logged twice.", retry: () => logFavorite(favorite) });
    }
  };

  const copyYesterday = async () => {
    setError(null);
    try {
      const response = await fetch("/api/meals/copy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: oneTapId.current }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError({ message: body.error, retry: null });
        return;
      }
      finish();
    } catch {
      setError({ message: "You're offline or the connection dropped. Try again; it won't be logged twice.", retry: copyYesterday });
    }
  };

  const errorBlock = error ? (
    <div className="space-y-2">
      <FormError message={error.message} />
      {error.retry ? <Button type="button" variant="secondary" className="w-full" onClick={error.retry}>Retry</Button> : null}
    </div>
  ) : null;

  const totals = meal ? totalsOf(meal.items) : null;
  const leftAfter = budget.kcalLeft !== null && meal?.eatenOn === budget.today && totals ? budget.kcalLeft - totals.kcal : null;
  const yesterdayMeal = budget.currentMeal;
  const backStage = (stage === "item" || stage === "add" || stage === "favorite-name") ? "review" : stage === "swap" ? "item" : stage === "label" ? "add" : stage === "type" || stage === "favorites" ? "capture" : stage === "review" ? (mealIndex > 0 ? "review" : "capture") : null;

  const title: Record<Stage, string> = {
    capture: "Log a meal",
    type: "Type your meal",
    working: workingText,
    review: meals.length > 1 ? `Meal ${mealIndex + 1} of ${meals.length}` : "Check your meal",
    item: "Edit item",
    swap: "Change food",
    add: "Add a food",
    label: "Enter from a label",
    "favorite-name": "Save as favorite",
    favorites: "Repeat a favorite",
    remember: "Remember this?",
  };

  return (
    <div className="mx-auto flex h-full w-full flex-col bg-background px-4 pt-[max(env(safe-area-inset-top),0.5rem)] pb-[max(env(safe-area-inset-bottom),1rem)] lg:max-w-xl lg:py-6">
      <div className="-ml-3 flex h-11 shrink-0 items-center">
        {stage === "capture" ? (
          <Link href="/" transitionTypes={["nav-back"]} aria-label="Back" className="flex size-11 items-center justify-center"><Chevron direction="left" /></Link>
        ) : backStage ? (
          <button
            type="button"
            aria-label="Back"
            onClick={() => {
              setError(null);
              if (stage === "review" && mealIndex > 0) setMealIndex(mealIndex - 1);
              go(backStage, "nav-back");
            }}
            className="flex size-11 items-center justify-center"
          >
            <Chevron direction="left" />
          </button>
        ) : null}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <ViewTransition key={stage} enter={MOTION} exit={MOTION} default="none">
          <div className="flex h-full flex-col bg-background">
            <h1 className="mb-3 shrink-0 text-2xl font-semibold tracking-tight">{title[stage]}</h1>

            {stage === "capture" ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 text-center">
                  <button
                    type="button"
                    onClick={() => (voice.recording ? voice.stop() : voice.start())}
                    aria-label={voice.recording ? "Stop recording" : "Start recording"}
                    className="flex size-28 items-center justify-center rounded-full bg-foreground text-background"
                  >
                    {voice.recording ? (
                      <span className="size-8 rounded bg-background" />
                    ) : (
                      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="9" y="3" width="6" height="11" rx="3" />
                        <path d="M5.500 11.500a6.500 6.500 0 0 0 13 0M12 18v3" />
                      </svg>
                    )}
                  </button>
                  {voice.recording ? (
                    <>
                      <div aria-hidden="true" className="h-1.5 w-40 overflow-hidden rounded-full bg-track">
                        {browserVoice ? (
                          <div className="working-bar h-full w-1/3 rounded-full" style={{ background: "var(--data-calories)" }} />
                        ) : (
                          <div className="h-full rounded-full" style={{ width: `${recorder.level * 100}%`, background: "var(--data-calories)" }} />
                        )}
                      </div>
                      <p className="line-clamp-3 min-h-10 max-w-xs text-sm text-muted">{voice.liveText || "Listening. Tap to finish, or just pause."}</p>
                    </>
                  ) : (
                    <p className="max-w-xs text-sm text-muted">Say what you ate, with amounts if you know them.</p>
                  )}
                  {voiceError ? <FormError message={voiceError} /> : null}
                </div>
                <div className="shrink-0 space-y-3">
                  {errorBlock}
                  <NavList>
                    <button type="button" onClick={() => go("type")} className="flex min-h-12 w-full items-center justify-between px-4 text-sm font-medium">Type instead<Chevron direction="right" /></button>
                    <button type="button" onClick={() => go("add")} className="flex min-h-12 w-full items-center justify-between px-4 text-sm font-medium">Search foods<Chevron direction="right" /></button>
                    <button type="button" onClick={openFavorites} className="flex min-h-12 w-full items-center justify-between px-4 text-sm font-medium">Repeat a favorite<Chevron direction="right" /></button>
                    <button type="button" onClick={copyYesterday} className="flex min-h-12 w-full items-center justify-between px-4 text-sm font-medium">Copy yesterday&apos;s {yesterdayMeal}<Chevron direction="right" /></button>
                  </NavList>
                </div>
              </div>
            ) : null}

            {stage === "type" ? (
              <form
                className="flex min-h-0 flex-1 flex-col gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (text.trim()) void parse(text.trim(), "text");
                }}
              >
                <label className="block">
                  <span className="sr-only">What you ate</span>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={5}
                    maxLength={2000}
                    placeholder="60 grams of quick oats, 300 grams of milk and one scoop of whey"
                    className="w-full rounded-md border border-border bg-background p-3 text-foreground placeholder:text-muted"
                  />
                </label>
                {errorBlock}
                <div className="mt-auto">
                  <Button type="submit" disabled={!text.trim()} className="w-full">Continue</Button>
                </div>
              </form>
            ) : null}

            {stage === "working" ? (
              <div className="flex flex-1 items-center justify-center">
                <div role="status" aria-label={workingText} className="h-1.5 w-40 overflow-hidden rounded-full bg-track">
                  <div className="working-bar h-full w-1/3 rounded-full" style={{ background: "var(--data-calories)" }} />
                </div>
              </div>
            ) : null}

            {stage === "review" && meal ? (
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                {meal.transcript ? <p className="line-clamp-1 shrink-0 text-sm text-muted">&ldquo;{meal.transcript}&rdquo;</p> : null}
                {unresolved.length ? <p role="status" className="line-clamp-1 shrink-0 text-sm">Not found: {unresolved.join(", ")}. Add with Add food.</p> : null}
                <div className="grid shrink-0 grid-cols-2 gap-2">
                  <Select aria-label="Meal" value={meal.mealType} onChange={(e) => updateMeal({ mealType: e.target.value as DraftMeal["mealType"] })}>
                    {MEAL_OPTIONS.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
                  </Select>
                  <Button type="button" variant="secondary" onClick={() => go("add")}>Add food</Button>
                </div>
                <div className="min-h-0 flex-1">
                  {meal.items.length ? (
                    <Pager
                      key={meal.clientId}
                      label="Items"
                      items={meal.items}
                      rowHeight={84}
                      renderRow={(item) => <ItemCard item={item} onOpen={() => openItem(item)} onDelete={() => removeItem(item.key)} />}
                    />
                  ) : (
                    <p className="text-sm text-muted">No items left. Add a food to continue.</p>
                  )}
                </div>
                <div className="shrink-0 space-y-3 border-t border-border pt-3">
                  {totals ? (
                    <div className="flex items-baseline justify-between text-sm tabular-nums">
                      <span className="font-medium">{Math.round(totals.kcal).toLocaleString("en-US")} kcal</span>
                      <span className="text-muted">P {Math.round(totals.protein)} C {Math.round(totals.carbs)} F {Math.round(totals.fat)}</span>
                      {leftAfter !== null ? <span className="text-muted">{Math.round(Math.abs(leftAfter)).toLocaleString("en-US")} {leftAfter < 0 ? "over" : "left"}</span> : null}
                    </div>
                  ) : null}
                  {errorBlock}
                  {mealIndex < meals.length - 1 ? (
                    <Button type="button" className="w-full" disabled={meal.items.length === 0} onClick={() => { setMealIndex(mealIndex + 1); go("review"); }}>Next meal</Button>
                  ) : (
                    <div className="grid grid-cols-[auto_1fr] gap-2">
                      <Button type="button" variant="secondary" onClick={() => go("favorite-name")}>{favoriteName ? "Favorite" : "Save favorite"}</Button>
                      <Button type="button" disabled={saving || meals.some((m) => m.items.length === 0)} onClick={confirm}>Confirm</Button>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {stage === "item" && active ? (
              <div className="flex min-h-0 flex-1 flex-col gap-4">
                <div className="shrink-0">
                  <p className="line-clamp-2 text-sm font-medium">{active.food.name}</p>
                  {active.phrase ? <p className="mt-1 line-clamp-1 text-sm text-muted">You said: {active.phrase}</p> : null}
                </div>
                {active.assumptions.length ? (
                  <ul className="shrink-0 space-y-1">
                    {active.assumptions.slice(0, 3).map((assumption) => (
                      <li key={assumption}>
                        <button type="button" onClick={() => go("swap")} className="rounded px-1.5 py-0.5 text-left text-xs font-medium" style={{ background: "var(--status-estimated)", color: "var(--on-status-amber)" }}>
                          {assumption}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <AmountEditor
                  food={active.food}
                  quantityText={quantityText}
                  unit={active.unit}
                  grams={active.grams}
                  onQuantity={(value) => setAmount(value, active.unit)}
                  onUnit={(unit) => setAmount(quantityText, unit)}
                />
                <div className="mt-auto grid shrink-0 grid-cols-2 gap-2">
                  <Button type="button" variant="secondary" onClick={() => go("swap")}>Change food</Button>
                  <Button type="button" variant="danger" onClick={() => { removeItem(active.key); go("review", "nav-back"); }}>Remove</Button>
                </div>
                <Button type="button" className="w-full shrink-0" disabled={!(Number(quantityText) > 0)} onClick={() => go("review", "nav-back")}>Done</Button>
              </div>
            ) : null}

            {stage === "swap" && active ? (
              <div className="min-h-0 flex-1"><FoodPicker initialQuery={active.parsedFood ?? active.food.name.split(",")[0]} onPick={swapFood} /></div>
            ) : null}

            {stage === "add" ? (
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                <div className="min-h-0 flex-1"><FoodPicker onPick={addFood} /></div>
                <Button type="button" variant="secondary" className="w-full shrink-0" onClick={() => go("label")}>Enter from a label</Button>
              </div>
            ) : null}

            {stage === "label" ? (
              <form className="flex min-h-0 flex-1 flex-col gap-3" onSubmit={(event) => { event.preventDefault(); if (labelValid) saveLabel(); }}>
                <Field label="Food name"><Input value={label.name} onChange={(e) => setLabel({ ...label, name: e.target.value })} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Calories"><Input inputMode="decimal" value={label.kcal} onChange={(e) => setLabel({ ...label, kcal: e.target.value })} /></Field>
                  <Field label="Serving (g)"><Input inputMode="decimal" value={label.grams} onChange={(e) => setLabel({ ...label, grams: e.target.value })} placeholder="100" /></Field>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Protein (g)"><Input inputMode="decimal" value={label.protein} onChange={(e) => setLabel({ ...label, protein: e.target.value })} /></Field>
                  <Field label="Carbs (g)"><Input inputMode="decimal" value={label.carbs} onChange={(e) => setLabel({ ...label, carbs: e.target.value })} /></Field>
                  <Field label="Fat (g)"><Input inputMode="decimal" value={label.fat} onChange={(e) => setLabel({ ...label, fat: e.target.value })} /></Field>
                </div>
                <div className="mt-auto"><Button type="submit" disabled={!labelValid} className="w-full">Add food</Button></div>
              </form>
            ) : null}

            {stage === "favorite-name" ? (
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                <Field label="Name" hint="Repeat this meal later in one tap.">
                  <Input value={favoriteName} placeholder="My oats bowl" onChange={(e) => setFavoriteName(e.target.value)} />
                </Field>
                <div className="mt-auto"><Button type="button" className="w-full" onClick={() => go("review", "nav-back")}>Done</Button></div>
              </div>
            ) : null}

            {stage === "favorites" ? (
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                {errorBlock}
                {favorites === null ? null : favorites.length === 0 ? (
                  <p className="text-sm text-muted">No favorites yet. When you check a meal, choose Save favorite to keep it here.</p>
                ) : (
                  <div className="min-h-0 flex-1">
                    <Pager
                      label="Favorites"
                      items={favorites}
                      rowHeight={56}
                      renderRow={(favorite) => (
                        <button type="button" onClick={() => logFavorite(favorite)} className="flex h-full w-full items-center justify-between gap-4 text-left text-sm">
                          <span className="truncate font-medium">{favorite.name}</span>
                          <span className="shrink-0 text-muted tabular-nums">{favorite.kcal.toLocaleString("en-US")} kcal</span>
                        </button>
                      )}
                    />
                  </div>
                )}
              </div>
            ) : null}

            {stage === "remember" && offers[0] ? (
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                <p>Always use <span className="font-medium">{offers[0].food_name}</span> when you say &ldquo;{offers[0].phrase}&rdquo;?</p>
                <FormError message={error?.message} />
                <div className="mt-auto grid grid-cols-2 gap-2">
                  <Button type="button" variant="secondary" onClick={() => answerOffer(false)}>Not now</Button>
                  <Button type="button" onClick={() => answerOffer(true)}>Always use it</Button>
                </div>
              </div>
            ) : null}
          </div>
        </ViewTransition>
      </div>
    </div>
  );
}

