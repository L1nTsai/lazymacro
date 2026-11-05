"use client";

import { usePathname } from "next/navigation";
import { ViewTransition, type ReactNode } from "react";

const MOTION = { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" };

/**
 * On phones the menu and a setting are separate pages, so the menu slides. On
 * desktop they sit side by side and the menu stays put, which takes its own copy.
 */
export function MeColumns({ menu, children }: { menu: ReactNode; children: ReactNode }) {
  const onMenu = usePathname() === "/me";
  return (
    <div className="grid h-full lg:mx-auto lg:max-w-6xl lg:grid-cols-[22rem_1fr]">
      <div className="hidden h-full min-h-0 border-r border-border lg:block">{menu}</div>
      {onMenu ? (
        <div className="h-full min-h-0 lg:hidden">
          <ViewTransition enter={MOTION} exit={MOTION} default="none">
            <div className="h-full">{menu}</div>
          </ViewTransition>
        </div>
      ) : null}
      <div className={`${onMenu ? "hidden lg:block" : "block"} h-full min-h-0`}>{children}</div>
    </div>
  );
}
