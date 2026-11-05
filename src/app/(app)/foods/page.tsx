import { PageSlide } from "@/components/page-slide";
import { PageTitle } from "@/components/ui";
import { FoodSearch } from "./food-search";
import { requireProfile } from "@/lib/profile";

export default async function FoodsPage() {
  await requireProfile();
  return (
    <PageSlide>
      <div className="mx-auto flex h-full w-full flex-col gap-3 px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-4 lg:max-w-2xl lg:py-6">
        <PageTitle>Search foods</PageTitle>
        <FoodSearch />
      </div>
    </PageSlide>
  );
}
