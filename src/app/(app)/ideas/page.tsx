import { PageTitle } from "@/components/ui";
import { requireProfile } from "@/lib/profile";

export default async function Page() {
  await requireProfile();
  return (
    <div className="space-y-3 px-4 pt-[max(env(safe-area-inset-top),1rem)]">
      <PageTitle>Ideas</PageTitle>
      <p className="text-muted">Meal ideas from your fridge aren&apos;t available yet. They&apos;re planned after Fridge.</p>
    </div>
  );
}
