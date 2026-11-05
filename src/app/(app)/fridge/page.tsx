import { PageTitle } from "@/components/ui";
import { requireProfile } from "@/lib/profile";

export default async function Page() {
  await requireProfile();
  return (
    <div className="space-y-3 px-4 pt-[max(env(safe-area-inset-top),1rem)]">
      <PageTitle>Fridge</PageTitle>
      <p className="text-muted">Tracking your ingredients isn&apos;t available yet. It&apos;s planned after voice logging.</p>
    </div>
  );
}
