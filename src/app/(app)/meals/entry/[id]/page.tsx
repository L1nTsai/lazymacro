import { notFound } from "next/navigation";
import { PageSlide } from "@/components/page-slide";
import { FOOD_COLUMNS, toDraftFood } from "@/lib/logging/foods-db";
import { requireProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { EntryEditor } from "./entry-editor";

const safeBack = (value: string | undefined) => (value && /^\/(meals|history)(\/[\w-]+)*$/.test(value) ? value : "/");

export default async function EntryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ back?: string }> }) {
  await requireProfile();
  const { id } = await params;
  const { back } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("log_entries")
    .select(`id, quantity, unit, grams, phrase, assumptions, foods(${FOOD_COLUMNS})`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data?.foods) notFound();

  return (
    <PageSlide>
      <EntryEditor
        id={data.id}
        back={safeBack(back)}
        initial={{
          food: toDraftFood(data.foods as never),
          quantity: Number(data.quantity),
          unit: data.unit,
          grams: Number(data.grams),
          phrase: data.phrase,
        }}
      />
    </PageSlide>
  );
}
