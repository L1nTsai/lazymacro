"use client";

import { useActionState } from "react";
import { Button, Field, FormError, Input } from "@/components/ui";
import { deleteAccount } from "./actions";

export function DeleteAccount() {
  const [state, action, pending] = useActionState(deleteAccount, {});
  return (
    <details className="rounded-md border border-border">
      <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-medium">Delete account</summary>
      <form action={action} className="space-y-3 border-t border-border p-4">
        <p className="text-sm text-muted">This permanently deletes your account, goals and logs. It can&apos;t be undone.</p>
        <Field label="Type delete to confirm">
          <Input name="confirmation" autoComplete="off" />
        </Field>
        <FormError message={state.error} />
        <Button type="submit" variant="danger" disabled={pending} className="w-full">Delete my account</Button>
      </form>
    </details>
  );
}
