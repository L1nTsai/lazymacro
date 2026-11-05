import { redirect } from "next/navigation";
import { Button, PageTitle } from "@/components/ui";
import { confirmEmail } from "./actions";

/**
 * Used by the custom email templates, which need SMTP. Confirming takes a tap
 * because company mail scanners open links and would otherwise use up the token.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const { token_hash, type } = await searchParams;
  if (!token_hash || !type) redirect("/sign-in?notice=link-expired");

  return (
    <main className="mx-auto flex h-dvh w-full max-w-sm flex-col justify-center px-4 py-10">
      <PageTitle>{type === "recovery" ? "Reset your password" : "Confirm your email"}</PageTitle>
      <form action={confirmEmail} className="mt-6">
        <input type="hidden" name="token_hash" value={token_hash} />
        <input type="hidden" name="type" value={type} />
        <Button type="submit" className="w-full">Continue</Button>
      </form>
    </main>
  );
}
