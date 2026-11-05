"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const icon = (path: ReactNode) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {path}
  </svg>
);

const TODAY = icon(<><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5H12z" /></>);
const FRIDGE = icon(<><rect x="6" y="3" width="12" height="18" rx="2" /><path d="M6 10h12M9 6v1.5M9 13v3" /></>);
const IDEAS = icon(<><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" /></>);
const ME = icon(<><circle cx="12" cy="8" r="4" /><path d="M4.5 21c1-4 4-6 7.5-6s6.500 2 7.500 6" /></>);
const MIC = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.500 11.500a6.500 6.500 0 0 0 13 0M12 18v3" />
  </svg>
);

function Tab({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs ${active ? "font-medium text-foreground" : "text-muted"}`}
    >
      {children}
      {label}
    </Link>
  );
}

/** Pushed pages and setup take the whole screen, as they do on iOS. */
const hidesTabBar = (pathname: string) =>
  pathname.startsWith("/me/") ||
  pathname.startsWith("/meals") ||
  pathname.startsWith("/onboarding") ||
  pathname.startsWith("/log") ||
  pathname.startsWith("/history");

export function TabBar() {
  const pathname = usePathname();
  if (hidesTabBar(pathname)) return null;
  return (
    <nav
      aria-label="Main"
      style={{ viewTransitionName: "tab-bar" }}
      className="shrink-0 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto flex max-w-lg items-center px-2">
        <Tab href="/" label="Today">{TODAY}</Tab>
        <Tab href="/fridge" label="Fridge">{FRIDGE}</Tab>
        <div className="flex flex-1 justify-center">
          <Link
            href="/log?start=1"
            transitionTypes={["nav-forward"]}
            aria-label="Log a meal"
            className="-mt-6 flex size-14 items-center justify-center rounded-full border-4 border-background bg-foreground text-background"
          >
            {MIC}
          </Link>
        </div>
        <Tab href="/ideas" label="Ideas">{IDEAS}</Tab>
        <Tab href="/me" label="Me">{ME}</Tab>
      </div>
    </nav>
  );
}
