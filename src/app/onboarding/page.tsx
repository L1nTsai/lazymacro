import { redirect } from "next/navigation";
import { SetupForm } from "@/components/setup-form";
import { PageTitle } from "@/components/ui";
import { loadSetupDefaults } from "@/lib/setup-defaults";
import { createClient, getUserId } from "@/lib/supabase/server";

export default async function OnboardingPage() {
  const userId = await getUserId();
  if (!userId) redirect("/sign-in");

  const supabase = await createClient();
  const { defaults, hasProfile } = await loadSetupDefaults(supabase, userId);
  if (hasProfile) redirect("/");

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8">
      <PageTitle>Set your daily goals</PageTitle>
      <p className="mt-2 mb-6 text-muted">This takes about a minute. You can change everything later.</p>
      <SetupForm defaults={defaults} next="/" submitLabel="Save and continue" />
    </main>
  );
}
