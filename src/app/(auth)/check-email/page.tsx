import Link from "next/link";
import { PageTitle } from "@/components/ui";

export default function CheckEmailPage() {
  return (
    <>
      <PageTitle>Check your email</PageTitle>
      <p className="mt-3 text-muted">Open the link we sent you to confirm your address. You can then sign in.</p>
      <p className="mt-6 text-sm">
        <Link href="/sign-in" className="underline underline-offset-4">Back to sign in</Link>
      </p>
    </>
  );
}
