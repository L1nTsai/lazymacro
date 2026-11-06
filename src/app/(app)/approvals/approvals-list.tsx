"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Pager } from "@/components/pager";
import { Button, FormError } from "@/components/ui";
import { approveSignup } from "./actions";

export type WaitingPerson = { userId: string; email: string; signedUp: string };

export function ApprovalsList({ people }: { people: WaitingPerson[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [approving, startApproving] = useTransition();

  // Visited pages stay cached in the browser, which would hide anyone who just signed up.
  useEffect(() => router.refresh(), [router]);

  const approve = (person: WaitingPerson) =>
    startApproving(async () => {
      setError(null);
      try {
        const result = await approveSignup(person.userId);
        if (result.error) setError(result.error);
        else router.refresh();
      } catch {
        setError("That person wasn't approved. Try again.");
      }
    });

  if (!people.length) return <p className="text-sm text-muted">No one is waiting.</p>;

  return (
    <div className="flex h-full flex-col gap-2">
      <FormError message={error} />
      <div className="min-h-0 flex-1">
        <Pager
          key={people.map((person) => person.userId).join()}
          label="People waiting for approval"
          items={people}
          rowHeight={60}
          renderRow={(person) => (
            <div className="flex h-full items-center justify-between gap-3 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">{person.email}</span>
                <span className="block truncate text-muted">Signed up {person.signedUp}</span>
              </span>
              <Button type="button" disabled={approving} aria-label={`Approve ${person.email}`} onClick={() => approve(person)} className="shrink-0">
                Approve
              </Button>
            </div>
          )}
        />
      </div>
    </div>
  );
}
