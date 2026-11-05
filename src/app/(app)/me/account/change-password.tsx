"use client";

import { useActionState } from "react";
import { Button, Field, FormError, Input } from "@/components/ui";
import { changePassword } from "./actions";

export function ChangePassword() {
  const [state, action, pending] = useActionState(changePassword, {});
  return (
    <details className="rounded-md border border-border">
      <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-medium">Change password</summary>
      <form action={action} className="space-y-3 border-t border-border p-4">
        <Field label="New password" hint="At least 10 characters.">
          <Input name="password" type="password" autoComplete="new-password" minLength={10} maxLength={72} required />
        </Field>
        <FormError message={state.error} />
        {state.saved ? <p role="status" className="text-sm">Password changed.</p> : null}
        <Button type="submit" variant="secondary" disabled={pending} className="w-full">Save password</Button>
      </form>
    </details>
  );
}
