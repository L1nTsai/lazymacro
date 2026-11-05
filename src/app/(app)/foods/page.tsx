import { PageTitle } from "@/components/ui";
import { FoodSearch } from "./food-search";

export default function FoodsPage() {
  return (
    <div className="space-y-4">
      <PageTitle>Search foods</PageTitle>
      <FoodSearch />
    </div>
  );
}
