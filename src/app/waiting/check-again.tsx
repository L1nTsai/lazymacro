"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui";

/** Asks the server afresh, because a link could return this page from the cache. */
export function CheckAgain() {
  const router = useRouter();
  const [checking, startChecking] = useTransition();
  return (
    <Button type="button" disabled={checking} onClick={() => startChecking(() => router.refresh())}>
      Check again
    </Button>
  );
}
