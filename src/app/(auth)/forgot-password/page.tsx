import Link from "next/link";
import { PageTitle } from "@/components/ui";

export default function ForgotPasswordPage() {
  return (
    <>
      <PageTitle>Forgot your password?</PageTitle>
      <p className="mt-3 text-muted">Ask the person who approved your account to set a temporary one. You can change it under Me, then Account.</p>
      <p className="mt-6 text-sm">
        <Link href="/sign-in" className="underline underline-offset-4">Back to sign in</Link>
      </p>
    </>
  );
}
