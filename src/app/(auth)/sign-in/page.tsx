import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { Field, Input, PageTitle } from "@/components/ui";
import { signIn } from "../actions";

const NOTICES: Record<string, string> = {
  deleted: "Your account and data have been deleted.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  const message = notice ? NOTICES[notice] : undefined;
  return (
    <>
      <PageTitle>Sign in</PageTitle>
      {message ? <p role="status" className="mt-3 text-sm">{message}</p> : null}
      <div className="mt-6">
        <AuthForm action={signIn} submitLabel="Sign in">
          <Field label="Email">
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Password">
            <Input name="password" type="password" autoComplete="current-password" required />
          </Field>
        </AuthForm>
      </div>
      <div className="mt-6 flex justify-between text-sm">
        <Link href="/sign-up" className="underline underline-offset-4">Create an account</Link>
        <Link href="/forgot-password" className="text-muted underline underline-offset-4">Forgot password?</Link>
      </div>
    </>
  );
}
