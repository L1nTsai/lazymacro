import { TabBar } from "@/components/tab-bar";
import { isDeveloper } from "@/lib/profile";

/**
 * One layout for every signed-in page, because slides can't cross layouts.
 * Each page calls requireProfile; a layout check wouldn't stop a page rendering.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col lg:flex-row">
      <main className="mx-auto min-h-0 w-full max-w-lg flex-1 overflow-hidden lg:max-w-none">{children}</main>
      <TabBar showApprovals={await isDeveloper()} />
    </div>
  );
}
