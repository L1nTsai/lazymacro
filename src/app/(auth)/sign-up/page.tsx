import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { Field, Input, PageTitle } from "@/components/ui";
import { signUp } from "../actions";

export default function SignUpPage() {
  return (
    <>
      <PageTitle>Create your account</PageTitle>
      <div className="mt-6">
        <AuthForm action={signUp} submitLabel="Create account">
          <Field label="Gmail address">
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Password" hint="At least 10 characters.">
            <Input name="password" type="password" autoComplete="new-password" minLength={10} maxLength={72} required />
          </Field>
        </AuthForm>
      </div>
      <p className="mt-6 text-sm">
        <Link href="/sign-in" className="underline underline-offset-4">I already have an account</Link>
      </p>
    </>
  );
}
