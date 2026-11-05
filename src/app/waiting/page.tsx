import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/(auth)/actions";
import { BUTTON_STYLES, PageTitle } from "@/components/ui";
import { isApproved } from "@/lib/profile";
import { getUserId } from "@/lib/supabase/server";

export default async function WaitingPage() {
  const userId = await getUserId();
  if (!userId) redirect("/sign-in");
  if (await isApproved(userId)) redirect("/");

  return (
    <main className="mx-auto flex h-dvh w-full max-w-sm flex-col justify-center px-4 py-10">
      <p className="mb-8 text-lg font-semibold tracking-tight">LazyMacro</p>
      <PageTitle>Waiting for approval</PageTitle>
      <p className="mt-3 text-muted">Your account is set up. You can use LazyMacro once it&apos;s been approved.</p>
      <div className="mt-6 grid gap-3">
        <Link href="/waiting" prefetch={false} className={BUTTON_STYLES.primary}>Check again</Link>
        <form action={signOut}>
          <button type="submit" className={`${BUTTON_STYLES.secondary} w-full`}>Sign out</button>
        </form>
      </div>
    </main>
  );
}
