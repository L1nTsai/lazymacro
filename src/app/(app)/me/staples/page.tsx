import { PageSlide } from "@/components/page-slide";
import { SetupFlow } from "@/components/setup-flow";
import { requireProfile } from "@/lib/profile";
import type { StepId } from "@/lib/setup";
import { loadSetupDefaults } from "@/lib/setup-defaults";
import { createClient } from "@/lib/supabase/server";

const STEPS: StepId[] = ["staples"];

export default async function Page() {
  const { userId } = await requireProfile();
  const { defaults } = await loadSetupDefaults(await createClient(), userId);
  return (
    <PageSlide>
      <SetupFlow defaults={defaults} steps={STEPS} next="/me" direction="nav-back" back="/me" />
    </PageSlide>
  );
}
