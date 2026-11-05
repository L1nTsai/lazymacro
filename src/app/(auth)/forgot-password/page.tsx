import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { Field, Input, PageTitle } from "@/components/ui";
import { requestPasswordReset } from "../actions";

export default function ForgotPasswordPage() {
  return (
    <>
      <PageTitle>Reset your password</PageTitle>
      <div className="mt-6">
        <AuthForm action={requestPasswordReset} submitLabel="Send reset link">
          <Field label="Email">
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
        </AuthForm>
      </div>
      <p className="mt-6 text-sm">
        <Link href="/sign-in" className="underline underline-offset-4">Back to sign in</Link>
      </p>
    </>
  );
}
