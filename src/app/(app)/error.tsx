"use client";

import { Button, PageTitle } from "@/components/ui";

export default function AppError({ reset }: { reset: () => void }) {
  return (
    <div className="space-y-3">
      <PageTitle>This page didn&apos;t load</PageTitle>
      <p className="text-muted">Check your connection and try again.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
