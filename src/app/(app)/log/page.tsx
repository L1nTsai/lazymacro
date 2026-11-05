import Link from "next/link";
import { BUTTON_STYLES, PageTitle } from "@/components/ui";
import { requireProfile } from "@/lib/profile";

export default async function LogPage() {
  await requireProfile();
  return (
    <div className="space-y-3 px-4 pt-[max(env(safe-area-inset-top),1rem)]">
      <PageTitle>Log a meal</PageTitle>
      <p className="text-muted">Voice logging isn&apos;t available yet. It&apos;s the next thing being built. For now, you can look up foods.</p>
      <Link href="/foods" className={BUTTON_STYLES.secondary}>Search foods</Link>
    </div>
  );
}
