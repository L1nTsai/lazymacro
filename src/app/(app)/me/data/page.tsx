import { PageSlide } from "@/components/page-slide";
import { BUTTON_STYLES, SubPage } from "@/components/ui";
import { requireProfile } from "@/lib/profile";

export default async function DataPage() {
  await requireProfile();
  return (
    <PageSlide>
      <SubPage title="Your data" back="/me">
        <p className="mb-4 text-sm text-muted">Download your goals and everything you&apos;ve logged as a JSON file.</p>
        <a href="/api/me/export" className={`${BUTTON_STYLES.secondary} w-full`}>Export my data</a>
      </SubPage>
    </PageSlide>
  );
}
