import { redirect } from "next/navigation";
import { PageSlide } from "@/components/page-slide";
import { SetupFlow } from "@/components/setup-flow";
import { SETUP_STEPS } from "@/lib/setup";
import { loadSetupDefaults } from "@/lib/setup-defaults";
import { requireApproved } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";

export default async function OnboardingPage() {
  const userId = await requireApproved();

  const supabase = await createClient();
  const { defaults, complete } = await loadSetupDefaults(supabase, userId);
  if (complete) redirect("/");

  return (
    <PageSlide>
      <SetupFlow defaults={defaults} steps={SETUP_STEPS} next="/" direction="nav-forward" />
    </PageSlide>
  );
}
