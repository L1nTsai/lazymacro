import { PageSlide } from "@/components/page-slide";
import { NavList, NavRow, PageTitle } from "@/components/ui";
import { requireProfile } from "@/lib/profile";
import { loadSetupDefaults } from "@/lib/setup-defaults";
import { createClient } from "@/lib/supabase/server";

const count = (n: number) => (n === 0 ? "None" : String(n));

export default async function MePage() {
  const { userId, name } = await requireProfile();
  const { defaults } = await loadSetupDefaults(await createClient(), userId);
  const { targets, allergies, excluded, staples } = defaults;

  return (
    <PageSlide>
      <div className="flex h-full flex-col gap-4 px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-4">
        <PageTitle>{name}</PageTitle>
        <NavList>
          <NavRow href="/me/goals" label="Goals" detail={targets ? `${targets.kcal.toLocaleString("en-US")} kcal` : undefined} />
          <NavRow href="/me/avoid" label="Foods to avoid" detail={count(allergies.length + excluded.length)} />
          <NavRow href="/me/staples" label="Pantry staples" detail={count(staples.length)} />
          <NavRow href="/me/units" label="Units" />
          <NavRow href="/me/saved" label="Saved foods" />
          <NavRow href="/foods" label="Search foods" />
          <NavRow href="/me/data" label="Your data" />
          <NavRow href="/me/account" label="Account" />
        </NavList>
      </div>
    </PageSlide>
  );
}
