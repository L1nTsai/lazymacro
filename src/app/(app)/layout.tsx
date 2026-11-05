import { redirect } from "next/navigation";
import { TabBar } from "@/components/tab-bar";
import { createClient, getUserId } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const userId = await getUserId();
  if (!userId) redirect("/sign-in");

  const supabase = await createClient();
  const { data: profile, error } = await supabase.from("profiles").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!profile) redirect("/onboarding");

  return (
    <>
      <main className="mx-auto w-full max-w-lg px-4 pt-6 pb-[calc(7rem+env(safe-area-inset-bottom))]">{children}</main>
      <TabBar />
    </>
  );
}
