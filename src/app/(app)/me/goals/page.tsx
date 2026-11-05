import { SetupForm } from "@/components/setup-form";
import { PageTitle } from "@/components/ui";
import { loadSetupDefaults } from "@/lib/setup-defaults";
import { createClient, getUserId } from "@/lib/supabase/server";

export default async function GoalsPage() {
  const userId = (await getUserId())!;
  const supabase = await createClient();
  const { defaults } = await loadSetupDefaults(supabase, userId);

  return (
    <div className="space-y-6">
      <PageTitle>Edit goals</PageTitle>
      <SetupForm defaults={defaults} next="/me" submitLabel="Save goals" />
    </div>
  );
}
