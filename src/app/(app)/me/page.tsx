import Link from "next/link";
import { signOut } from "@/app/(auth)/actions";
import { BUTTON_STYLES, PageTitle } from "@/components/ui";
import { loadSetupDefaults } from "@/lib/setup-defaults";
import { createClient, getUserId } from "@/lib/supabase/server";
import { DeleteAccount } from "./delete-account";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6 px-4 py-3 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

export default async function MePage() {
  const userId = (await getUserId())!;
  const supabase = await createClient();
  const { defaults } = await loadSetupDefaults(supabase, userId);
  const { targets, allergies, excluded, staples } = defaults;

  return (
    <div className="space-y-8">
      <PageTitle>Me</PageTitle>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Goals</h2>
          <Link href="/me/goals" className="flex min-h-11 items-center text-sm underline underline-offset-4">Edit</Link>
        </div>
        <dl className="divide-y divide-border rounded-md border border-border">
          {targets ? (
            <>
              <Row label="Calories" value={`${targets.kcal.toLocaleString("en-US")} kcal`} />
              <Row label="Protein" value={`${targets.proteinG} g`} />
              <Row label="Carbs" value={`${targets.carbsG} g`} />
              <Row label="Fat" value={`${targets.fatG} g`} />
            </>
          ) : null}
          <Row label="Allergies" value={allergies.join(", ") || "None"} />
          <Row label="Foods you don't eat" value={excluded.join(", ") || "None"} />
          <Row label="Pantry staples" value={staples.join(", ") || "None"} />
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Foods and data</h2>
        <div className="grid gap-3">
          <Link href="/foods" className={BUTTON_STYLES.secondary}>Search foods</Link>
          <a href="/api/me/export" className={BUTTON_STYLES.secondary}>Export my data</a>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Account</h2>
        <form action={signOut}>
          <button type="submit" className={`${BUTTON_STYLES.secondary} w-full`}>Sign out</button>
        </form>
        <DeleteAccount />
      </section>
    </div>
  );
}
