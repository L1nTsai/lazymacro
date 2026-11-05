import { PageSlide } from "@/components/page-slide";
import { RemovableList } from "@/components/removable-list";
import { SubPage } from "@/components/ui";
import { requireProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";

export default async function FavoritesPage() {
  const { userId } = await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.from("favorites").select("id, name, favorite_items(id)").eq("user_id", userId).order("name");
  if (error) throw error;
  const items = data.map((favorite) => ({
    key: favorite.id,
    title: favorite.name,
    detail: `${favorite.favorite_items.length} ${favorite.favorite_items.length === 1 ? "item" : "items"}`,
    deleteUrl: `/api/favorites/${favorite.id}`,
  }));

  return (
    <PageSlide>
      <SubPage title="Favorite meals" back="/me/saved">
        {items.length ? <RemovableList items={items} label="Favorite meals" /> : <p className="text-sm text-muted">When you check a meal, choose Save favorite to keep it here.</p>}
      </SubPage>
    </PageSlide>
  );
}
