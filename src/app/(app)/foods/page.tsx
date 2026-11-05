import { PageSlide } from "@/components/page-slide";
import { PageTitle } from "@/components/ui";
import { FoodSearch } from "./food-search";
import { requireProfile } from "@/lib/profile";

export default async function FoodsPage() {
  await requireProfile();
  return (
    <PageSlide>
      <div className="flex h-full flex-col gap-3 px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-4">
        <PageTitle>Search foods</PageTitle>
        <FoodSearch />
      </div>
    </PageSlide>
  );
}
