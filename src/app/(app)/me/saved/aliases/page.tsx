import { PageSlide } from "@/components/page-slide";
import { RemovableList } from "@/components/removable-list";
import { SubPage } from "@/components/ui";
import { requireProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";

export default async function AliasesPage() {
  const { userId } = await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.from("user_aliases").select("phrase, foods(name)").eq("user_id", userId).order("phrase");
  if (error) throw error;
  const items = data.map((alias) => ({
    key: alias.phrase,
    title: `"${alias.phrase}"`,
    detail: (alias.foods as unknown as { name: string } | null)?.name ?? "",
    deleteUrl: `/api/aliases?phrase=${encodeURIComponent(alias.phrase)}`,
  }));

  return (
    <PageSlide>
      <SubPage title="What you always mean" back="/me/saved">
        {items.length ? <RemovableList items={items} label="Saved phrases" /> : <p className="text-sm text-muted">When you change the same food twice, the app offers to remember it here.</p>}
      </SubPage>
    </PageSlide>
  );
}
