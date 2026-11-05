"use client";

import { useActionState, type ReactNode } from "react";
import type { FormState } from "@/app/(auth)/actions";
import { Button, FormError } from "./ui";

export function AuthForm({
  action,
  submitLabel,
  children,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  submitLabel: string;
  children: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4">
      {children}
      <FormError message={state.error} />
      {state.notice ? <p role="status" className="text-sm">{state.notice}</p> : null}
      <Button type="submit" disabled={pending} className="w-full">
        {submitLabel}
      </Button>
    </form>
  );
}
