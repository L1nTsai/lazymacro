import { signOut } from "@/app/(auth)/actions";
import { PageSlide } from "@/components/page-slide";
import { BUTTON_STYLES, SubPage } from "@/components/ui";
import { ChangePassword } from "./change-password";
import { DeleteAccount } from "./delete-account";
import { requireProfile } from "@/lib/profile";

export default async function AccountPage() {
  await requireProfile();
  return (
    <PageSlide>
      <SubPage title="Account" back="/me">
        <div className="space-y-3">
          <form action={signOut}>
            <button type="submit" className={`${BUTTON_STYLES.secondary} w-full`}>Sign out</button>
          </form>
          <ChangePassword />
          <DeleteAccount />
        </div>
      </SubPage>
    </PageSlide>
  );
}
