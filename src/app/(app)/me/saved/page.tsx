import { PageSlide } from "@/components/page-slide";
import { NavList, NavRow, SubPage } from "@/components/ui";
import { requireProfile } from "@/lib/profile";

export default async function SavedPage() {
  await requireProfile();
  return (
    <PageSlide>
      <SubPage title="Saved foods" back="/me">
        <NavList>
          <NavRow href="/me/saved/aliases" label="What you always mean" />
          <NavRow href="/me/saved/favorites" label="Favorite meals" />
        </NavList>
      </SubPage>
    </PageSlide>
  );
}
