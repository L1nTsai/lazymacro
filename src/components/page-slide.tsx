import { ViewTransition, type ReactNode } from "react";

const DIRECTIONS = { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" };

/**
 * Slides this page in or out when a link marks the navigation with a direction.
 * Anything else, such as switching tabs, changes instantly.
 */
export function PageSlide({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter={DIRECTIONS} exit={DIRECTIONS} default="none">
      <div className="h-full bg-background">{children}</div>
    </ViewTransition>
  );
}
