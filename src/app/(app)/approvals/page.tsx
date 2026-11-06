import { PageTitle } from "@/components/ui";
import { requireDeveloper } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { ApprovalsList } from "./approvals-list";

export default async function ApprovalsPage() {
  const { timezone } = await requireDeveloper();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_pending_approvals");
  if (error) throw error;

  const signedUp = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: timezone });
  const people = (data as { user_id: string; email: string; created_at: string }[]).map((row) => ({
    userId: row.user_id,
    email: row.email,
    signedUp: signedUp.format(new Date(row.created_at)),
  }));

  return (
    <div className="mx-auto flex h-full w-full flex-col gap-4 px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-4 lg:max-w-xl lg:py-6">
      <div className="shrink-0 space-y-3">
        <PageTitle>Approvals</PageTitle>
        <p className="text-sm text-muted">Addresses aren&apos;t verified, so check with someone before approving them.</p>
      </div>
      <div className="min-h-0 flex-1">
        <ApprovalsList people={people} />
      </div>
    </div>
  );
}
